//! Stateful initialization: administrative credentials are deliberately memory-only.
use super::*;
use std::sync::LazyLock;
use tokio::sync::Mutex;
use zeroize::Zeroize;
mod cloudflare;
mod journal;
mod provision;
use journal::{Job, Spec};

static GRANTS: LazyLock<Mutex<HashMap<String, Grant>>> = LazyLock::new(Default::default);
static RUNNING: LazyLock<Mutex<Option<tokio_util::sync::CancellationToken>>> =
    LazyLock::new(Default::default);
static JOB_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Grant {
    #[serde(default)]
    owner: String,
    pub base: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub cloudflare_token: String,
    #[serde(default)]
    pub operator_password: String,
    #[serde(default)]
    expires: i64,
}
impl Drop for Grant {
    fn drop(&mut self) {
        self.password.zeroize();
        self.api_key.zeroize();
        self.cloudflare_token.zeroize();
        self.operator_password.zeroize();
    }
}
impl Grant {
    pub async fn call(&self, app: &App, method: &str, args: Value) -> Result<Value> {
        let upstream = Stalwart {
            http: app.upstream.http.clone(),
            base: self.base.clone(),
        };
        Ok(if !self.api_key.is_empty() {
            upstream.call(&self.api_key, method, args).await?
        } else {
            upstream
                .password_call(&self.username, &self.password, method, args)
                .await?
        })
    }
}
pub(super) fn routes() -> Router<Arc<App>> {
    Router::new()
        .route(
            "/installation/initialize/authorize",
            post(authorize_temporary),
        )
        .route("/installation/initialize/preflight", post(preflight))
        .route("/installation/initialize/job", get(progress).post(start))
        .route("/installation/initialize/cancel", post(cancel))
}
async fn owner(app: &App, headers: &HeaderMap, write: bool) -> Result<String> {
    authorize(app, headers, write).await?;
    if let Some(candidate) = headers.get("authorization").and_then(|h| h.to_str().ok()) {
        Ok(hash(candidate))
    } else {
        Ok(identity(app, headers, false).await?.user.to_string())
    }
}
fn normalize_source(raw: &str) -> Result<String> {
    let raw = if raw.contains("://") {
        raw.to_owned()
    } else {
        format!("https://{raw}")
    };
    let url = reqwest::Url::parse(raw.trim())
        .map_err(|_| Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"))?;
    let test = std::env::var("ALLOW_INSECURE_TEST_UPSTREAM").as_deref() == Ok("true");
    if !(url.scheme() == "https" || (test && url.scheme() == "http"))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(
            url.path(),
            "/" | "/admin" | "/admin/" | "/account" | "/account/"
        )
    {
        return Err(Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"));
    }
    Ok(url.origin().ascii_serialization())
}
async fn grant(ticket: &str, owner: &str) -> Result<Grant> {
    let mut grants = GRANTS.lock().await;
    grants.retain(|_, g| g.expires > db::now());
    let value = grants
        .get_mut(ticket)
        .filter(|g| g.owner == owner)
        .ok_or(Error(
            StatusCode::UNAUTHORIZED,
            "initialization_authorization_expired",
        ))?;
    value.expires = db::now() + 600_000;
    Ok(value.clone())
}
#[utoipa::path(post,tag="installation",path="/api/v1/installation/initialize/authorize",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn authorize_temporary(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(mut input): Json<Grant>,
) -> Result<Json<Value>> {
    let who = owner(&app, &headers, true).await?;
    policy::rate(&app, &format!("initialize:{who}"), 20, 60_000).await?;
    input.base = normalize_source(&input.base)?;
    if input.api_key.is_empty() && (input.username.is_empty() || input.password.is_empty()) {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "administrator_credentials_required",
        ));
    }
    if [
        &input.username,
        &input.password,
        &input.api_key,
        &input.cloudflare_token,
        &input.operator_password,
    ]
    .iter()
    .any(|s| s.len() > 4096)
    {
        return Err(Error(StatusCode::BAD_REQUEST, "credential_too_long"));
    }
    let domains = input
        .call(&app, "x:Domain/get", json!({"properties":["id","name"]}))
        .await?;
    // Reading both directories catches missing management rights before resource creation.
    input
        .call(&app, "x:Account/get", json!({"properties":["id"]}))
        .await?;
    let accounts = if input.cloudflare_token.is_empty() {
        json!([])
    } else {
        cloudflare::accounts(&app, &input.cloudflare_token).await?
    };
    input.owner = who.clone();
    input.expires = db::now() + 600_000;
    let ticket = token();
    let mut grants = GRANTS.lock().await;
    grants.retain(|_, g| g.owner != who && g.expires > db::now());
    grants.insert(ticket.clone(), input);
    drop(grants);
    let expiry_ticket = ticket.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            let mut grants = GRANTS.lock().await;
            if grants
                .get(&expiry_ticket)
                .is_none_or(|g| g.expires <= db::now())
            {
                grants.remove(&expiry_ticket);
                break;
            }
        }
    });
    Ok(Json(
        json!({"ticket":ticket,"domains":domains["list"],"cloudflareAccounts":accounts,"expiresInSeconds":600}),
    ))
}
#[derive(Deserialize)]
pub(crate) struct Request {
    ticket: String,
    spec: Spec,
    #[serde(default, rename = "operatorPassword")]
    operator_password: Option<String>,
}
#[utoipa::path(post,tag="installation",path="/api/v1/installation/initialize/preflight",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn preflight(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(mut input): Json<Request>,
) -> Result<Json<Value>> {
    let who = owner(&app, &headers, true).await?;
    let mut access = grant(&input.ticket, &who).await?;
    if let Some(password) = input.operator_password.take() {
        access.operator_password = password;
        if let Some(stored) = GRANTS.lock().await.get_mut(&input.ticket) {
            stored.operator_password = access.operator_password.clone();
        }
    }
    provision::validate(&app, &access, &input.spec).await?;
    Ok(Json(
        json!({"resources":["邮箱域名（已有则复用）","本安装专用目录服务身份与 API 密钥","验证码发件邮箱与 API 密钥","本安装专用 MTA Hook 与共享密钥","运营邮箱及策略作用范围"],"turnstile":!input.spec.cloudflare_account.is_empty(),"changesDns":false,"opensRegistration":false}),
    ))
}
#[utoipa::path(get,tag="installation",path="/api/v1/installation/initialize/job",responses((status=200,body=Value)))]
pub(crate) async fn progress(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let who = owner(&app, &headers, false).await?;
    let _guard = JOB_LOCK.lock().await;
    let Some(mut job) = journal::read(&app)? else {
        return Ok(Json(json!({"job":null})));
    };
    if job.owner != who {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "initialization_owner_required",
        ));
    }
    if job.status == "running" && RUNNING.lock().await.is_none() {
        job.status = "interrupted".into();
        job.error = "initialization_reauthorize_to_resume".into();
        journal::write(&app, &job)?;
    }
    Ok(Json(json!({"job":job.public()})))
}
#[utoipa::path(post,tag="installation",path="/api/v1/installation/initialize/job",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn start(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(mut input): Json<Request>,
) -> Result<Json<Value>> {
    let who = owner(&app, &headers, true).await?;
    let mut access = grant(&input.ticket, &who).await?;
    if let Some(password) = input.operator_password.take() {
        access.operator_password = password;
        if let Some(stored) = GRANTS.lock().await.get_mut(&input.ticket) {
            stored.operator_password = access.operator_password.clone();
        }
    }
    let _guard = JOB_LOCK.lock().await;
    if RUNNING.lock().await.is_some() {
        return Err(Error(StatusCode::CONFLICT, "initialization_running"));
    }
    provision::validate(&app, &access, &input.spec).await?;
    let mut job = match journal::read(&app)? {
        Some(job) => {
            if job.owner != who || job.base != access.base || job.spec != input.spec {
                return Err(Error(
                    StatusCode::CONFLICT,
                    "initialization_resume_original_plan",
                ));
            }
            job
        }
        None => Job::new(who, access.base.clone(), input.spec),
    };
    if job.status == "completed" {
        return Ok(Json(json!({"job":job.public()})));
    }
    job.status = "running".into();
    job.error.clear();
    journal::write(&app, &job)?;
    let cancellation = tokio_util::sync::CancellationToken::new();
    *RUNNING.lock().await = Some(cancellation.clone());
    let result = job.public();
    let ticket = input.ticket;
    tokio::spawn(async move {
        let outcome = provision::run(&app, &mut job, &access, &cancellation).await;
        let _guard = JOB_LOCK.lock().await;
        match outcome {
            Ok(()) => job.status = "completed".into(),
            Err(error) => {
                job.status = if cancellation.is_cancelled() {
                    "cancelled"
                } else {
                    "failed"
                }
                .into();
                job.error = error.1.into();
            }
        }
        let _ = journal::write(&app, &job);
        GRANTS.lock().await.remove(&ticket);
        *RUNNING.lock().await = None;
        if job.status == "completed" {
            tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
            RELOAD.notify_one();
        }
    });
    Ok(Json(json!({"job":result})))
}
#[utoipa::path(post,tag="installation",path="/api/v1/installation/initialize/cancel",responses((status=200,body=Value)))]
pub(crate) async fn cancel(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    let who = owner(&app, &headers, true).await?;
    {
        let _guard = JOB_LOCK.lock().await;
        if let Some(job) = journal::read(&app)?
            && job.owner != who
        {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "initialization_owner_required",
            ));
        }
    }
    GRANTS.lock().await.retain(|_, g| g.owner != who);
    if let Some(running) = RUNNING.lock().await.as_ref() {
        running.cancel();
    }
    Ok(Json(
        json!({"cancelRequested":true,"resourcesDeleted":false}),
    ))
}

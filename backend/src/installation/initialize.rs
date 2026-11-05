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
    #[serde(default)]
    permissions: Vec<String>,
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
    async fn inspect(&mut self, app: &App) -> Result<()> {
        let request = app.upstream.http.get(format!("{}/api/account", self.base));
        let request = if self.api_key.is_empty() {
            request.basic_auth(&self.username, Some(&self.password))
        } else {
            request.bearer_auth(&self.api_key)
        };
        let response = request
            .send()
            .await
            .map_err(|_| Error(StatusCode::BAD_GATEWAY, "mail_service_unavailable"))?;
        if !response.status().is_success() {
            return Err(Error(
                StatusCode::UNAUTHORIZED,
                "administrator_authentication_failed",
            ));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|_| Error(StatusCode::BAD_GATEWAY, "administrator_profile_invalid"))?;
        self.permissions = value["permissions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect();
        Ok(())
    }
    fn missing_permissions(&self, new_domain: bool) -> Vec<&'static str> {
        [
            "sysAccountGet",
            "sysAccountCreate",
            "sysAccountUpdate",
            "sysDomainGet",
            "sysMtaHookGet",
            "sysMtaHookCreate",
            "sysActionCreate",
            "actionReloadSettings",
        ]
        .into_iter()
        .chain(new_domain.then_some("sysDomainCreate"))
        .filter(|permission| !self.permissions.iter().any(|p| p == permission))
        .collect()
    }
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
    input.inspect(&app).await?;
    let missing = input.missing_permissions(false);
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
        json!({"ticket":ticket,"domains":domains["list"],"cloudflareAccounts":accounts,"missingPermissions":missing,"expiresInSeconds":600}),
    ))
}
#[derive(Deserialize)]
pub(crate) struct Request {
    ticket: String,
    spec: Spec,
    #[serde(default, rename = "operatorPassword")]
    operator_password: Option<String>,
}
fn normalize_spec(spec: &mut Spec) -> Result<()> {
    spec.brand = spec.brand.trim().into();
    spec.domain = spec.domain.trim().to_lowercase();
    spec.operator_email = spec.operator_email.trim().to_lowercase();
    spec.recovery_email = spec.recovery_email.trim().to_lowercase();
    spec.public_origin = config::validate_origin(spec.public_origin.trim())
        .map_err(|_| Error(StatusCode::BAD_REQUEST, "public_origin_invalid"))?;
    Ok(())
}
#[utoipa::path(post,tag="installation",path="/api/v1/installation/initialize/preflight",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn preflight(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(mut input): Json<Request>,
) -> Result<Json<Value>> {
    normalize_spec(&mut input.spec)?;
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
    if job.owner != who && job.status != "completed" {
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
    normalize_spec(&mut input.spec)?;
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
            Ok(()) => job.status = "applying".into(),
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
        if job.status == "applying" {
            tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
            RELOAD.notify_one();
        }
    });
    Ok(Json(json!({"job":result})))
}

/// Enable only after the restarted application can authenticate its own callback.
/// This uses the dedicated runtime key, never the administrator authorization.
pub(crate) async fn activate_pending(app: Arc<App>) {
    let Ok(Some(mut job)) = journal::read(&app) else {
        return;
    };
    if job.status != "applying"
        || job.base != app.upstream.base
        || job.resource("hook") != app.services.hook_id
    {
        return;
    }
    let callback = format!("{}/internal/mta-hook", app.origin);
    let mut reachable = false;
    for _ in 0..10 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if let Ok(response) = app
            .upstream
            .http
            .post(&callback)
            .bearer_auth(&app.services.hook_secret)
            .json(&json!({"context":{"stage":"data"}}))
            .send()
            .await
            && response.status().is_success()
            && response
                .json::<Value>()
                .await
                .is_ok_and(|value| value["action"] == "accept")
        {
            reachable = true;
            break;
        }
    }
    let _guard = JOB_LOCK.lock().await;
    if journal::read(&app)
        .ok()
        .flatten()
        .is_none_or(|current| current.status != "applying")
    {
        return;
    }
    if reachable && policy::sync_scope(&app).await.is_ok() {
        job.status = "completed".into();
        job.step = "completed".into();
        job.secrets.remove("previous-config");
    } else {
        job.status = "failed".into();
        job.error = "initialization_callback_unreachable".into();
        if let Some(previous) = job
            .secrets
            .get("previous-config")
            .and_then(|value| serde_json::from_str::<RuntimeConfig>(value).ok())
            && persist(&app.vault, &previous).is_ok()
        {
            RELOAD.notify_one();
        }
    }
    let _ = journal::write(&app, &job);
}
#[utoipa::path(post,tag="installation",path="/api/v1/installation/initialize/cancel",responses((status=200,body=Value)))]
pub(crate) async fn cancel(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    let who = owner(&app, &headers, true).await?;
    {
        let _guard = JOB_LOCK.lock().await;
        if journal::read(&app)?.is_some_and(|job| job.status == "applying") {
            return Err(Error(StatusCode::CONFLICT, "initialization_applying"));
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn temporary_authorization_enforces_owner_and_idle_expiry() {
        let ticket = token();
        let mut value:Grant=serde_json::from_value(json!({"base":"https://mail.example.com","username":"administrator","password":"memory-only-password"})).unwrap();
        value.owner = "owner-a".into();
        value.expires = db::now() + 30_000;
        GRANTS.lock().await.insert(ticket.clone(), value);
        assert!(grant(&ticket, "owner-b").await.is_err());
        assert!(grant(&ticket, "owner-a").await.is_ok());
        GRANTS.lock().await.get_mut(&ticket).unwrap().expires = db::now() - 1;
        assert!(grant(&ticket, "owner-a").await.is_err());
        assert!(!GRANTS.lock().await.contains_key(&ticket));
    }
    #[test]
    fn sources_reject_credentials_and_unrelated_paths() {
        assert_eq!(
            normalize_source("mail.example.com:8443/admin/").unwrap(),
            "https://mail.example.com:8443"
        );
        for raw in [
            "https://user:secret@mail.example.com",
            "https://mail.example.com/other",
            "https://mail.example.com?token=secret",
            "file:///secret",
        ] {
            assert!(normalize_source(raw).is_err());
        }
    }
}

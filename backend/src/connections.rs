//! Resolve upstream context from immutable local identity mappings, never client URLs.
use super::*;

pub async fn seed_default(app: &App) -> Result<()> {
    if app.upstream.base.is_empty() || app.services.domain.is_empty() {
        return Ok(());
    }
    let mut tx = db::begin(&app.db).await?;
    db::query(db::Statement::ConnectionSeedService)
        .bind(&app.upstream.base)
        .bind(&app.upstream.base)
        .execute(&mut *tx)
        .await?;
    db::query(db::Statement::ConnectionSeedDomain)
        .bind(&app.services.domain)
        .bind(&app.services.domain_id)
        .bind(&app.services.domain)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}
pub async fn for_domain(app: &App, id: &str) -> Result<Arc<App>> {
    let app = app.root.as_deref().unwrap_or(app);
    if id == "default" {
        let mut root = app.clone();
        let row = db::query(db::Statement::ConnectionService)
            .bind("default")
            .fetch_one(&app.db)
            .await?;
        root.revision = row.get("revision");
        return Ok(Arc::new(root));
    }
    let row = db::query(db::Statement::ConnectionDomain)
        .bind(id)
        .fetch_optional(&app.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "mail_domain_not_found"))?;
    let service: String = row.get("service_id");
    let mut scoped = app.clone();
    if service != "default" {
        let sealed: Option<Vec<u8>> = row.get("runtime");
        let bytes = app
            .vault
            .open(&sealed.ok_or(Error(
                StatusCode::SERVICE_UNAVAILABLE,
                "mail_service_not_configured",
            ))?)
            .map_err(internal)?;
        scoped.services = serde_json::from_slice(&bytes)
            .map_err(|_| internal("connection_configuration_invalid"))?;
        scoped.upstream.base = row.get("origin");
    }
    scoped.revision = row.get("revision");
    scoped.root = Some(Arc::new(app.clone()));
    scoped.service_id = service;
    scoped.domain_id = id.to_owned();
    scoped.services.domain = row.get("name");
    scoped.services.domain_id = row.get("upstream_id");
    // These settings belong to the web site, not to an upstream connection.
    scoped.services.brand = app.services.brand.clone();
    scoped.services.turnstile_site_key = app.services.turnstile_site_key.clone();
    scoped.services.turnstile_secret = app.services.turnstile_secret.clone();
    Ok(Arc::new(scoped))
}
pub async fn for_user(app: &App, user: Uuid) -> Result<Arc<App>> {
    let id: String = db::scalar(db::Statement::ConnectionUserDomain)
        .bind(user)
        .fetch_one(&app.db)
        .await?;
    for_domain(app, &id).await
}

pub fn routes() -> Router<Arc<App>> {
    Router::new()
        .route("/installation/connections", get(list).post(save))
        .route("/installation/connections/prepare", post(prepare))
        .route("/installation/connections/{id}", get(details))
}
#[utoipa::path(get,path="/api/v1/installation/connections/{id}",params(("id"=String,Path)),responses((status=200,body=Value)))]
pub(crate) async fn details(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    installation::authorize(&app, &headers, false).await?;
    let app = for_service(&app, &id).await?;
    let s = &app.services;
    Ok(Json(
        json!({"settings":{"notification_account":s.notification_account,"notification_email":s.notification_email,"hook_id":s.hook_id},"provisioningKeySet":!s.provisioning_key.is_empty(),"notificationKeySet":!s.notification_key.is_empty(),"hookSecretSet":!s.hook_secret.is_empty()}),
    ))
}
#[utoipa::path(get,path="/api/v1/installation/connections",responses((status=200,body=Value)))]
pub(crate) async fn list(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    installation::authorize(&app, &headers, false).await?;
    seed_default(&app).await?;
    let rows = db::query(db::Statement::ConnectionList)
        .fetch_all(&app.db)
        .await?;
    let services = db::query(db::Statement::ConnectionServicesList)
        .fetch_all(&app.db)
        .await?;
    Ok(Json(
        json!({"services":services.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"origin":r.get::<String,_>("origin"),"revision":r.get::<i64,_>("revision"),"configured":if r.get::<String,_>("id")=="default"{installation::configured(&app)}else{r.get::<Option<Vec<u8>>,_>("runtime").is_some()}})).collect::<Vec<_>>(),"domains":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"serviceId":r.get::<String,_>("service_id"),"name":r.get::<String,_>("name"),"upstreamId":r.get::<String,_>("upstream_id"),"serviceName":r.get::<String,_>("service_name"),"origin":r.get::<String,_>("origin"),"revision":r.get::<i64,_>("revision"),"configured":if r.get::<String,_>("service_id")=="default"{installation::configured(&app)}else{r.get::<Option<Vec<u8>>,_>("runtime").is_some()}})).collect::<Vec<_>>()}),
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionInput {
    #[serde(default)]
    id: Option<String>,
    name: String,
    origin: String,
    settings: config::Services,
    domains: Vec<String>,
}
#[utoipa::path(post,path="/api/v1/installation/connections",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn save(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(mut input): Json<ConnectionInput>,
) -> Result<Json<Value>> {
    installation::authorize(&app, &headers, true).await?;
    let base = reqwest::Url::parse(input.origin.trim())
        .map_err(|_| Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"))?;
    let isolated = std::env::var("ALLOW_INSECURE_TEST_UPSTREAM").as_deref() == Ok("true");
    if !(base.scheme() == "https" || (isolated && base.scheme() == "http"))
        || !base.username().is_empty()
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
        || base.path() != "/"
    {
        return Err(Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"));
    }
    let origin = base.origin().ascii_serialization();
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    if id != "default" && Uuid::parse_str(&id).is_err() {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "connection_configuration_invalid",
        ));
    }
    if id == "default" {
        if origin != app.upstream.base {
            return Err(Error(
                StatusCode::CONFLICT,
                "initialization_server_migration_required",
            ));
        }
        input.settings = app.services.clone();
    }
    let name = input.name.trim();
    if name.is_empty()
        || name.chars().count() > 80
        || name.chars().any(char::is_control)
        || input.domains.is_empty()
        || input.domains.len() > 100
    {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "connection_configuration_invalid",
        ));
    }
    let previous = db::query(db::Statement::ConnectionService)
        .bind(&id)
        .fetch_optional(&app.db)
        .await?;
    let observed_revision = previous.as_ref().map(|r| r.get::<i64, _>("revision"));
    let source_changed = previous
        .as_ref()
        .is_some_and(|r| r.get::<String, _>("origin") != origin);
    if let Some(previous) = previous {
        let old_origin: String = previous.get("origin");
        if old_origin != origin {
            let users: i64 = db::scalar(db::Statement::ConnectionServiceUsers)
                .bind(&id)
                .fetch_one(&app.db)
                .await?;
            if users > 0 {
                return Err(Error(
                    StatusCode::CONFLICT,
                    "initialization_server_migration_required",
                ));
            }
            if input.settings.provisioning_key.is_empty() {
                return Err(Error(StatusCode::BAD_REQUEST, "new_server_key_required"));
            }
        } else if let Some(sealed) = previous.get::<Option<Vec<u8>>, _>("runtime") {
            let old: config::Services =
                serde_json::from_slice(&app.vault.open(&sealed).map_err(internal)?)
                    .map_err(|_| internal("configuration_invalid"))?;
            if input.settings.provisioning_key.is_empty() {
                input.settings.provisioning_key = old.provisioning_key;
            }
            if input.settings.notification_key.is_empty() {
                input.settings.notification_key = old.notification_key;
            }
            if input.settings.hook_secret.is_empty() {
                input.settings.hook_secret = old.hook_secret;
            }
            if input.settings.notification_account.is_empty() {
                input.settings.notification_account = old.notification_account;
            }
            if input.settings.notification_email.is_empty() {
                input.settings.notification_email = old.notification_email;
            }
            if input.settings.hook_id.is_empty() {
                input.settings.hook_id = old.hook_id;
            }
        }
    }
    if input.settings.provisioning_key.is_empty() {
        return Err(Error(StatusCode::BAD_REQUEST, "provisioning_key_required"));
    }
    let upstream = Stalwart {
        http: app.upstream.http.clone(),
        base: origin.clone(),
    };
    let remote = upstream
        .call(
            &input.settings.provisioning_key,
            "x:Domain/get",
            json!({"properties":["id","name"]}),
        )
        .await?;
    let mut bindings = Vec::new();
    for domain in input.domains {
        let domain = domain.trim().trim_end_matches('.').to_lowercase();
        if !installation::domain_valid(&domain) {
            return Err(Error(StatusCode::BAD_REQUEST, "site_configuration_invalid"));
        }
        let remote_id = remote["list"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|d| {
                d["name"]
                    .as_str()
                    .is_some_and(|name| name.eq_ignore_ascii_case(&domain))
            })
            .and_then(|d| d["id"].as_str())
            .ok_or(Error(StatusCode::BAD_REQUEST, "configured_domain_missing"))?;
        if !bindings.iter().any(|(name, _)| name == &domain) {
            bindings.push((domain, remote_id.to_owned()));
        }
    }
    // Site credentials are never copied into per-server runtime records.
    input.settings.brand.clear();
    input.settings.turnstile_site_key.clear();
    input.settings.turnstile_secret.clear();
    input.settings.domain.clear();
    input.settings.domain_id.clear();
    input.settings.policy_verified = false;
    let cipher = app
        .vault
        .seal(&serde_json::to_vec(&input.settings).map_err(|_| internal("configuration_encode"))?)
        .map_err(internal)?;
    let mut policy = registration::settings(&app).await?;
    policy["enabled"] = json!(false);
    let mut tx = db::begin(&app.db).await?;
    let locked = db::query(db::Statement::ConnectionService)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?;
    if locked.as_ref().map(|r| r.get::<i64, _>("revision")) != observed_revision {
        return Err(Error(
            StatusCode::CONFLICT,
            "connection_configuration_changed",
        ));
    }
    if source_changed
        && db::scalar::<i64>(db::Statement::ConnectionServiceUsers)
            .bind(&id)
            .fetch_one(&mut *tx)
            .await?
            > 0
    {
        return Err(Error(
            StatusCode::CONFLICT,
            "initialization_server_migration_required",
        ));
    }
    db::query(db::Statement::ConnectionSave)
        .bind(&id)
        .bind(name)
        .bind(&origin)
        .bind(if id == "default" { None } else { Some(cipher) })
        .execute(&mut *tx)
        .await
        .map_err(|_| Error(StatusCode::CONFLICT, "connection_already_exists"))?;
    for (name, remote_id) in bindings {
        if let Some(old) = db::query(db::Statement::ConnectionDomainByName)
            .bind(&name)
            .fetch_optional(&mut *tx)
            .await?
        {
            if old.get::<String, _>("service_id") != id
                || old.get::<String, _>("upstream_id") != remote_id
            {
                return Err(Error(StatusCode::CONFLICT, "domain_already_bound"));
            }
        } else {
            let domain = Uuid::new_v4().to_string();
            db::query(db::Statement::ConnectionDomainInsert)
                .bind(&domain)
                .bind(&id)
                .bind(name)
                .bind(remote_id)
                .execute(&mut *tx)
                .await?;
            db::query(db::Statement::ConnectionPolicyInsert)
                .bind(&domain)
                .bind(policy.to_string())
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(Json(json!({"serviceId":id,"saved":true})))
}

pub async fn for_service(app: &App, id: &str) -> Result<Arc<App>> {
    let root = app.root.as_deref().unwrap_or(app);
    if id == "default" {
        return for_domain(root, "default").await;
    }
    if let Some(domain) = db::scalar::<String>(db::Statement::ConnectionServiceDomain)
        .bind(id)
        .fetch_optional(&root.db)
        .await?
    {
        return for_domain(root, &domain).await;
    }
    let row = db::query(db::Statement::ConnectionService)
        .bind(id)
        .fetch_optional(&root.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "mail_service_not_found"))?;
    let mut scoped = root.clone();
    scoped.root = Some(Arc::new(root.clone()));
    scoped.service_id = id.into();
    scoped.domain_id = format!("pending-{id}");
    scoped.revision = row.get("revision");
    scoped.upstream.base = row.get("origin");
    scoped.services = config::Services {
        brand: root.services.brand.clone(),
        turnstile_site_key: root.services.turnstile_site_key.clone(),
        turnstile_secret: root.services.turnstile_secret.clone(),
        ..Default::default()
    };
    Ok(Arc::new(scoped))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Prepare {
    id: Uuid,
    name: String,
    origin: String,
}
#[utoipa::path(post,path="/api/v1/installation/connections/prepare",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn prepare(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Prepare>,
) -> Result<Json<Value>> {
    installation::authorize(&app, &headers, true).await?;
    if !installation::configured(&app)
        || db::scalar::<i64>(db::Statement::InstallationOperatorCount)
            .fetch_one(&app.db)
            .await?
            == 0
    {
        return Err(Error(StatusCode::BAD_REQUEST, "setup_required"));
    }
    let origin = installation::initialize::normalize_source(&input.origin)?;
    if input.name.trim().is_empty()
        || input.name.chars().count() > 80
        || input.name.chars().any(char::is_control)
    {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "connection_configuration_invalid",
        ));
    }
    let id = input.id.to_string();
    let mut tx = db::begin(&app.db).await?;
    if let Some(old) = db::query(db::Statement::ConnectionService)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        && old.get::<String, _>("origin") != origin
    {
        return Err(Error(
            StatusCode::CONFLICT,
            "initialization_server_migration_required",
        ));
    }
    db::query(db::Statement::ConnectionPrepare)
        .bind(&id)
        .bind(input.name.trim())
        .bind(origin)
        .execute(&mut *tx)
        .await
        .map_err(|_| Error(StatusCode::CONFLICT, "connection_already_exists"))?;
    tx.commit().await?;
    Ok(Json(json!({"serviceId":id})))
}
pub async fn apply_runtime(app: &App, settings: &config::Services) -> Result<()> {
    let mut local = settings.clone();
    local.domain.clear();
    local.domain_id.clear();
    local.brand.clear();
    local.turnstile_secret.clear();
    local.turnstile_site_key.clear();
    local.policy_verified = false;
    let cipher = app
        .vault
        .seal(&serde_json::to_vec(&local).map_err(|_| internal("configuration_encode"))?)
        .map_err(internal)?;
    let mut tx = db::begin(&app.db).await?;
    let service = db::query(db::Statement::ConnectionService)
        .bind(&app.service_id)
        .fetch_one(&mut *tx)
        .await?;
    if service.get::<String, _>("origin") != app.upstream.base {
        return Err(Error(
            StatusCode::CONFLICT,
            "connection_configuration_changed",
        ));
    }
    db::query(db::Statement::ConnectionSave)
        .bind(&app.service_id)
        .bind(service.get::<String, _>("name"))
        .bind(&app.upstream.base)
        .bind(cipher)
        .execute(&mut *tx)
        .await?;
    if let Some(old) = db::query(db::Statement::ConnectionDomainByName)
        .bind(&settings.domain)
        .fetch_optional(&mut *tx)
        .await?
    {
        if old.get::<String, _>("service_id") != app.service_id
            || old.get::<String, _>("upstream_id") != settings.domain_id
        {
            return Err(Error(StatusCode::CONFLICT, "domain_already_bound"));
        }
    } else {
        let id = Uuid::new_v4().to_string();
        db::query(db::Statement::ConnectionDomainInsert)
            .bind(&id)
            .bind(&app.service_id)
            .bind(&settings.domain)
            .bind(&settings.domain_id)
            .execute(&mut *tx)
            .await?;
        let mut policy = registration::settings(app.root.as_deref().unwrap_or(app)).await?;
        policy["enabled"] = json!(false);
        db::query(db::Statement::ConnectionPolicyInsert)
            .bind(id)
            .bind(policy.to_string())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    #[tokio::test]
    async fn colliding_remote_ids_route_login_and_mail_to_the_bound_service_only() {
        async fn upstream(
            tag: &'static str,
            count: Arc<AtomicUsize>,
        ) -> (String, tokio::task::JoinHandle<()>) {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let router=Router::new().route("/jmap/",post(move |Json(body):Json<Value>|{let count=count.clone();async move{
    count.fetch_add(1,Ordering::SeqCst);
    let method=body["methodCalls"][0][0].as_str().unwrap();
    let result=if method=="x:ApiKey/set" {json!({"created":{"session":{"id":format!("key-{tag}"),"secret":format!("secret-{tag}")}}})}else{json!({"list":[{"id":format!("inbox-{tag}"),"name":tag,"role":"inbox"}]})};
    Json(json!({"methodResponses":[[method,result,"c"]]}))
   }}));
            let task = tokio::spawn(async move {
                axum::serve(listener, router).await.unwrap();
            });
            (format!("http://{address}"), task)
        }
        let calls_a = Arc::new(AtomicUsize::new(0));
        let calls_b = Arc::new(AtomicUsize::new(0));
        let (source_a, task_a) = upstream("a", calls_a.clone()).await;
        let (source_b, task_b) = upstream("b", calls_b.clone()).await;
        let directory = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let db = db::connect(&directory.join("routing.sqlite"))
            .await
            .unwrap();
        let vault = Vault::new(&[8; 32]).unwrap();
        let services = config::Services {
            domain: "a.example".into(),
            ..Default::default()
        };
        let root = Arc::new(App {
            root: None,
            revision: 0,
            service_id: "default".into(),
            domain_id: "default".into(),
            db: db.clone(),
            vault: vault.clone(),
            origin: "https://webmail.example".into(),
            upstream: Stalwart {
                http: reqwest::Client::new(),
                base: source_a.clone(),
            },
            services,
        });
        seed_default(&root).await.unwrap();
        let cipher = vault
            .seal(&serde_json::to_vec(&config::Services::default()).unwrap())
            .unwrap();
        sqlx::query("INSERT INTO mail_services(id,name,origin,runtime) VALUES ('b','B',?,?)")
            .bind(source_b.clone())
            .bind(cipher)
            .execute(&db)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO mail_domains VALUES ('b-domain','b','b.example','upstream-domain')",
        )
        .execute(&db)
        .await
        .unwrap();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        sqlx::query("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status) VALUES (?,'user@a.example','a@external.example','shared','active')").bind(a).execute(&db).await.unwrap();
        sqlx::query("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status,service_id,domain_id) VALUES (?,'user@b.example','b@external.example','shared','active','b','b-domain')").bind(b).execute(&db).await.unwrap();
        assert!(sqlx::query("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status,service_id,domain_id) VALUES (?,'duplicate@b.example','duplicate@external.example','shared','active','b','b-domain')").bind(Uuid::new_v4()).execute(&db).await.is_err());
        let mut headers = HeaderMap::new();
        headers.insert(
            "origin",
            HeaderValue::from_static("https://webmail.example"),
        );
        let response = super::super::login(
            State(root.clone()),
            axum::extract::ConnectInfo("127.0.0.1:1234".parse().unwrap()),
            headers.clone(),
            Json(Login {
                email: "user@b.example".into(),
                password: "test-only-password".into(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(calls_a.load(Ordering::SeqCst), 0);
        assert_eq!(calls_b.load(Ordering::SeqCst), 1);
        let cookie = response
            .headers()
            .get_all("set-cookie")
            .iter()
            .map(|v| v.to_str().unwrap())
            .find(|v| v.starts_with("__Host-mail_session="))
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        headers.insert("cookie", HeaderValue::from_str(cookie).unwrap());
        let result = super::super::mailboxes(State(root.clone()), headers.clone())
            .await
            .unwrap();
        assert_eq!(result.0["list"][0]["id"], "inbox-b");
        assert_eq!(calls_a.load(Ordering::SeqCst), 0);
        assert_eq!(calls_b.load(Ordering::SeqCst), 2);
        let scoped = for_user(&root, b).await.unwrap();
        assert_eq!(scoped.upstream.base, source_b);
        let default = for_domain(&scoped, "default").await.unwrap();
        assert_eq!(default.upstream.base, source_a);
        sqlx::query("UPDATE platform_users SET status='disabled' WHERE id=?")
            .bind(b)
            .execute(&db)
            .await
            .unwrap();
        assert!(
            super::super::login(
                State(root),
                axum::extract::ConnectInfo("127.0.0.1:1234".parse().unwrap()),
                headers,
                Json(Login {
                    email: "user@b.example".into(),
                    password: "test-only-password".into()
                })
            )
            .await
            .is_err()
        );
        assert_eq!(calls_b.load(Ordering::SeqCst), 2);
        task_a.abort();
        task_b.abort();
        db.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }
}

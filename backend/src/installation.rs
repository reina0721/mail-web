use super::*;
use std::{io::Write, path::PathBuf};
use subtle::ConstantTimeEq;
pub(super) mod discovery;
pub(super) mod initialize;

pub static RELOAD: tokio::sync::Notify = tokio::sync::Notify::const_new();
static INSTANCE_ID: std::sync::LazyLock<String> = std::sync::LazyLock::new(token);
static CONFIG_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub version: u32,
    pub origin: String,
    pub stalwart_url: String,
    pub services: config::Services,
}
fn config_path() -> PathBuf {
    std::env::var("RUNTIME_CONFIG_FILE")
        .unwrap_or_else(|_| "config/runtime.enc".into())
        .into()
}
fn token_path() -> PathBuf {
    std::env::var("SETUP_TOKEN_FILE")
        .unwrap_or_else(|_| "secrets/setup.key".into())
        .into()
}
pub fn load(
    vault: &Vault,
) -> std::result::Result<Option<RuntimeConfig>, Box<dyn std::error::Error>> {
    load_at(vault, &config_path())
}
fn load_at(
    vault: &Vault,
    path: &std::path::Path,
) -> std::result::Result<Option<RuntimeConfig>, Box<dyn std::error::Error>> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = vault.open(&std::fs::read(path)?)?;
    let value: RuntimeConfig = serde_json::from_slice(&bytes)?;
    if value.version != 1 {
        return Err("unsupported runtime configuration version".into());
    }
    Ok(Some(value))
}
pub fn ensure_token() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let path = token_path();
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(token().as_bytes())?;
    file.sync_all()?;
    Ok(())
}
fn persist(vault: &Vault, value: &RuntimeConfig) -> Result<()> {
    persist_at(vault, value, &config_path())
}
pub fn set_policy_verified(
    vault: &Vault,
    verified: bool,
) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let mut current = load(vault)?.ok_or("complete the setup panel first")?;
    if verified
        && (current.services.hook_id.is_empty()
            || current.services.hook_secret.is_empty()
            || current.services.provisioning_key.is_empty())
    {
        return Err(
            "configure the dedicated submission hook before recording protocol acceptance".into(),
        );
    }
    current.services.policy_verified = verified;
    persist(vault, &current).map_err(|_| "configuration could not be saved")?;
    Ok(())
}
fn persist_at(vault: &Vault, value: &RuntimeConfig, path: &std::path::Path) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| internal("configuration_path"))?;
    std::fs::create_dir_all(parent).map_err(|_| internal("configuration_directory"))?;
    let temporary = parent.join(format!(".runtime-{}.tmp", token()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| -> std::result::Result<(), Box<dyn std::error::Error>> {
        let mut file = options.open(&temporary)?;
        file.write_all(&vault.seal(&serde_json::to_vec(value)?)?)?;
        file.sync_all()?;
        std::fs::rename(&temporary, path)?;
        #[cfg(unix)]
        std::fs::File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result.map_err(|_| internal("configuration_write"))
}
pub fn configured(app: &App) -> bool {
    !app.origin.is_empty() && !app.upstream.base.is_empty() && !app.services.domain.is_empty()
}
pub fn routes() -> Router<Arc<App>> {
    Router::new()
        .route("/installation", get(status))
        .route("/installation/config", get(read_config).put(save_config))
        .route("/installation/operator", post(enroll_operator))
        .route("/installation/discover", post(discovery::discover))
        .merge(initialize::routes())
}
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct InstallationStatus {
    configured: bool,
    needs_operator: bool,
    brand: String,
    domain: String,
    version: String,
    instance_id: String,
}
#[utoipa::path(get,path="/api/v1/installation",responses((status=200,body=InstallationStatus)))]
pub(super) async fn status(State(app): State<Arc<App>>) -> Result<Json<InstallationStatus>> {
    let operators: i64 = db::scalar(db::Statement::InstallationOperatorCount)
        .fetch_one(&app.db)
        .await?;
    Ok(Json(InstallationStatus {
        configured: configured(&app),
        needs_operator: operators == 0,
        brand: app.services.brand.clone(),
        domain: app.services.domain.clone(),
        version: env!("CARGO_PKG_VERSION").into(),
        instance_id: INSTANCE_ID.clone(),
    }))
}
async fn authorize(app: &App, headers: &HeaderMap, write: bool) -> Result<()> {
    if let Some(candidate) = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
    {
        let stored = std::fs::read_to_string(token_path()).unwrap_or_default();
        if maintenance_matches(&stored, candidate) {
            // A maintenance token is a separate capability; browser writes still
            // require the exact configured origin, or a same-host first install.
            if write {
                if configured(app) {
                    same_origin(app, headers)?;
                } else {
                    let origin = headers
                        .get("origin")
                        .and_then(|h| h.to_str().ok())
                        .and_then(|s| reqwest::Url::parse(s).ok())
                        .ok_or(Error(StatusCode::FORBIDDEN, "origin_invalid"))?;
                    let host = headers
                        .get("host")
                        .and_then(|h| h.to_str().ok())
                        .unwrap_or_default();
                    let authority = match origin.port() {
                        Some(port) => format!("{}:{port}", origin.host_str().unwrap_or_default()),
                        None => origin.host_str().unwrap_or_default().to_owned(),
                    };
                    if authority != host || !matches!(origin.scheme(), "https" | "http") {
                        return Err(Error(StatusCode::FORBIDDEN, "origin_invalid"));
                    }
                }
            }
            return Ok(());
        }
        return Err(Error(StatusCode::UNAUTHORIZED, "setup_token_invalid"));
    }
    let who = identity(app, headers, write).await?;
    if !who.operator {
        return Err(Error(StatusCode::FORBIDDEN, "operator_required"));
    }
    Ok(())
}
#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct ConfigurationInput {
    pub brand: String,
    pub domain: String,
    pub public_origin: String,
    pub stalwart_url: String,
    #[serde(default)]
    pub domain_id: String,
    #[serde(default)]
    pub provisioning_key: Option<String>,
    #[serde(default)]
    pub notification_key: Option<String>,
    #[serde(default)]
    pub notification_account: String,
    #[serde(default)]
    pub notification_email: String,
    #[serde(default)]
    pub hook_id: String,
    #[serde(default)]
    pub hook_secret: Option<String>,
    #[serde(default)]
    pub turnstile_site_key: String,
    #[serde(default)]
    pub turnstile_secret: Option<String>,
}
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct ConfigurationView {
    settings: ConfigurationInput,
    provisioning_key_set: bool,
    notification_key_set: bool,
    hook_secret_set: bool,
    turnstile_secret_set: bool,
    policy_verified: bool,
    missing_requirements: Vec<String>,
    documentation_url: String,
}
#[utoipa::path(get,path="/api/v1/installation/config",responses((status=200,body=ConfigurationView),(status=401,description="Maintenance token or operator session required")))]
pub(super) async fn read_config(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<ConfigurationView>> {
    authorize(&app, &headers, false).await?;
    let s = &app.services;
    Ok(Json(ConfigurationView {
        settings: ConfigurationInput {
            brand: s.brand.clone(),
            domain: s.domain.clone(),
            public_origin: app.origin.clone(),
            stalwart_url: app.upstream.base.clone(),
            domain_id: s.domain_id.clone(),
            provisioning_key: None,
            notification_key: None,
            notification_account: s.notification_account.clone(),
            notification_email: s.notification_email.clone(),
            hook_id: s.hook_id.clone(),
            hook_secret: None,
            turnstile_site_key: s.turnstile_site_key.clone(),
            turnstile_secret: None,
        },
        provisioning_key_set: !s.provisioning_key.is_empty(),
        notification_key_set: !s.notification_key.is_empty(),
        hook_secret_set: !s.hook_secret.is_empty(),
        turnstile_secret_set: !s.turnstile_secret.is_empty(),
        policy_verified: s.policy_verified,
        missing_requirements: discovery::missing(s),
        documentation_url: discovery::documentation_url(),
    }))
}
fn domain_valid(domain: &str) -> bool {
    domain.len() <= 253
        && domain.contains('.')
        && domain.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
        && domain.parse::<std::net::IpAddr>().is_err()
}
fn retain_secret(input: Option<String>, old: &str) -> String {
    input
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_owned())
        .unwrap_or_else(|| old.to_owned())
}
#[utoipa::path(put,path="/api/v1/installation/config",request_body=ConfigurationInput,responses((status=200,body=Value),(status=400,description="Invalid configuration"),(status=401,description="Authorization required")))]
pub(super) async fn save_config(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<ConfigurationInput>,
) -> Result<Json<Value>> {
    authorize(&app, &headers, true).await?;
    let _lock = CONFIG_LOCK.lock().await;
    if initialize::active(&app).await? {
        return Err(Error(StatusCode::CONFLICT, "initialization_running"));
    }
    let domain = input.domain.trim().to_lowercase();
    let brand = input.brand.trim().to_owned();
    if !domain_valid(&domain)
        || brand.is_empty()
        || brand.len() > 80
        || brand.chars().any(char::is_control)
    {
        return Err(Error(StatusCode::BAD_REQUEST, "site_configuration_invalid"));
    }
    let origin = config::validate_origin(input.public_origin.trim())
        .map_err(|_| Error(StatusCode::BAD_REQUEST, "public_origin_invalid"))?;
    let base = reqwest::Url::parse(input.stalwart_url.trim())
        .map_err(|_| Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"))?;
    let test_http = std::env::var("ALLOW_INSECURE_TEST_UPSTREAM").as_deref() == Ok("true");
    if !(base.scheme() == "https" || (test_http && base.scheme() == "http"))
        || !base.username().is_empty()
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
        || base.path() != "/"
    {
        return Err(Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"));
    }
    if configured(&app) && domain != app.services.domain {
        let count: i64 = db::scalar(db::Statement::InstallationUserCount)
            .fetch_one(&app.db)
            .await?;
        if count > 0 {
            return Err(Error(StatusCode::CONFLICT, "domain_has_accounts"));
        }
    }
    let changed_server = base.origin().ascii_serialization() != app.upstream.base;
    let provisioning_key = discovery::connection_key(
        &app,
        &base.origin().ascii_serialization(),
        input.provisioning_key,
    )?;
    if provisioning_key.is_empty() {
        return Err(Error(StatusCode::BAD_REQUEST, "provisioning_key_required"));
    }
    let upstream = Stalwart {
        http: app.upstream.http.clone(),
        base: base.origin().ascii_serialization(),
    };
    let domains = upstream
        .call(
            &provisioning_key,
            "x:Domain/get",
            json!({"properties":["id","name"]}),
        )
        .await?;
    let domain_id = domains["list"]
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                item["name"]
                    .as_str()
                    .is_some_and(|name| name.eq_ignore_ascii_case(&domain))
            })
        })
        .and_then(|item| item["id"].as_str())
        .ok_or(Error(StatusCode::BAD_REQUEST, "configured_domain_missing"))?
        .to_owned();
    if !input.domain_id.is_empty() && input.domain_id != domain_id {
        return Err(Error(StatusCode::BAD_REQUEST, "domain_id_mismatch"));
    }
    let mut services = config::Services {
        domain,
        brand,
        domain_id,
        provisioning_key,
        notification_key: retain_secret(
            input.notification_key,
            if changed_server {
                ""
            } else {
                &app.services.notification_key
            },
        ),
        notification_account: input.notification_account,
        notification_email: input.notification_email,
        hook_secret: retain_secret(
            input.hook_secret,
            if changed_server {
                ""
            } else {
                &app.services.hook_secret
            },
        ),
        hook_id: input.hook_id,
        turnstile_secret: retain_secret(input.turnstile_secret, &app.services.turnstile_secret),
        turnstile_site_key: input.turnstile_site_key,
        // Connection changes cannot silently certify protocol enforcement.
        policy_verified: false,
    };
    services.policy_verified = app.services.policy_verified
        && services.domain == app.services.domain
        && upstream.base == app.upstream.base
        && origin == app.origin
        && services.hook_id == app.services.hook_id
        && services.hook_secret == app.services.hook_secret
        && services.provisioning_key == app.services.provisioning_key;
    persist(
        &app.vault,
        &RuntimeConfig {
            version: 1,
            origin,
            stalwart_url: upstream.base,
            services,
        },
    )?;
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        RELOAD.notify_one();
    });
    Ok(Json(json!({"saved":true,"restartRequired":true})))
}
#[derive(Deserialize, ToSchema)]
pub(super) struct OperatorInput {
    email: String,
    password: String,
    recovery: String,
}
#[utoipa::path(post,path="/api/v1/installation/operator",request_body=OperatorInput,responses((status=204,description="Existing ordinary mailbox enrolled as platform operator"),(status=400,description="Ordinary account in the configured domain required")))]
pub(super) async fn enroll_operator(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<OperatorInput>,
) -> Result<StatusCode> {
    authorize(&app, &headers, true).await?;
    let _lock = CONFIG_LOCK.lock().await;
    if initialize::active(&app).await? {
        return Err(Error(StatusCode::CONFLICT, "initialization_running"));
    }
    let count: i64 = db::scalar(db::Statement::InstallationOperatorCount)
        .fetch_one(&app.db)
        .await?;
    if count > 0 {
        return Err(Error(StatusCode::CONFLICT, "operator_already_initialized"));
    }
    let email = input.email.trim().to_lowercase();
    if !configured(&app)
        || !app.services.is_local_address(&email)
        || app.services.is_local_address(&input.recovery)
        || !input.recovery.contains('@')
        || input.password.len() > 512
    {
        return Err(Error(StatusCode::BAD_REQUEST, "operator_identity_invalid"));
    }
    let session = app
        .upstream
        .password_session(&email, &input.password)
        .await?;
    let account = session["primaryAccounts"]["urn:ietf:params:jmap:mail"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_REQUEST, "mail_account_required"))?;
    let info = app
        .upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/get",
            json!({"ids":[account],"properties":["id","name","domainId","roles","permissions"]}),
        )
        .await?;
    let item = &info["list"][0];
    if privileged_permissions(item)
        || item["roles"]["@type"] != "User"
        || item["domainId"] != app.services.domain_id
        || item["name"].as_str() != email.split('@').next()
    {
        return Err(Error(StatusCode::BAD_REQUEST, "ordinary_mailbox_required"));
    }
    db::query(db::Statement::InstallationEnrollOperator)
        .bind(Uuid::new_v4())
        .bind(email)
        .bind(input.recovery.to_lowercase())
        .bind(account)
        .execute(&app.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

fn privileged_permissions(item: &Value) -> bool {
    // Stalwart also names ordinary self-service permissions sysApiKey* and
    // sysAccountPassword*. Reject directory/system administration, while
    // retaining the existing mail-only account permission contract.
    let ordinary = account::user_permissions(true);
    item["permissions"]["enabledPermissions"]
        .as_object()
        .is_some_and(|permissions| {
            permissions.iter().any(|(name, value)| {
                name.starts_with("sys")
                    && value == true
                    && ordinary["enabledPermissions"][name] != true
            })
        })
}

fn maintenance_matches(stored: &str, candidate: &str) -> bool {
    stored.trim().len() == 64
        && candidate.len() == 64
        && bool::from(
            hash(stored.trim())
                .as_bytes()
                .ct_eq(hash(candidate).as_bytes()),
        )
}

#[cfg(test)]
mod tests {
    #[test]
    fn ordinary_self_service_is_not_directory_administration() {
        let ordinary = serde_json::json!({"permissions": crate::account::user_permissions(true)});
        assert!(!super::privileged_permissions(&ordinary));
        let mut service = ordinary;
        service["permissions"]["enabledPermissions"]["sysAccountCreate"] = serde_json::json!(true);
        assert!(super::privileged_permissions(&service));
    }
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    #[test]
    fn persisted_configuration_is_authenticated_and_replaceable() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/runtime")
            .join(format!("configuration-{}", Uuid::new_v4()));
        let path = directory.join("runtime.enc");
        let vault = Vault::new(&[7; 32]).unwrap();
        assert!(load_at(&vault, &path).unwrap().is_none());
        let mut value = RuntimeConfig {
            version: 1,
            origin: "https://webmail.example".into(),
            stalwart_url: "https://upstream.example".into(),
            services: config::Services {
                domain: "alpha.example".into(),
                brand: "Custom name".into(),
                provisioning_key: "sensitive-service-key".into(),
                ..config::Services::default()
            },
        };
        persist_at(&vault, &value, &path).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(
            !bytes
                .windows(21)
                .any(|part| part == b"sensitive-service-key")
        );
        assert_eq!(
            load_at(&vault, &path).unwrap().unwrap().services.domain,
            "alpha.example"
        );
        assert!(load_at(&Vault::new(&[8; 32]).unwrap(), &path).is_err());
        value.services.brand = "Updated name".into();
        persist_at(&vault, &value, &path).unwrap();
        assert_eq!(
            load_at(&vault, &path).unwrap().unwrap().services.brand,
            "Updated name"
        );
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        std::fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn maintenance_capability_and_domain_validation_are_strict() {
        let key = "a".repeat(64);
        assert!(maintenance_matches(&format!("{key}\n"), &key));
        assert!(!maintenance_matches(&key, &"b".repeat(64)));
        assert!(!maintenance_matches("", ""));
        assert!(!maintenance_matches(&key, &format!(" {key}")));
        for domain in ["mail.example", "another.example", "xn--bcher-kva.example"] {
            assert!(domain_valid(domain));
        }
        for domain in [
            "",
            "@mail.example",
            "https://mail.example",
            "a..example",
            "-mail.example",
            "127.0.0.1",
        ] {
            assert!(!domain_valid(domain));
        }
    }
    #[tokio::test]
    async fn unconfigured_status_is_public_but_configuration_is_protected() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/runtime")
            .join(format!("installation-{}", Uuid::new_v4()));
        let app = Arc::new(App {
            db: db::connect(&directory.join("mail.sqlite")).await.unwrap(),
            upstream: Stalwart {
                http: reqwest::Client::new(),
                base: String::new(),
            },
            vault: Vault::new(&[9; 32]).unwrap(),
            origin: String::new(),
            services: config::Services {
                brand: "Mail Web".into(),
                ..config::Services::default()
            },
        });
        let router = routes().with_state(app.clone());
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/installation")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), 65536)
            .await
            .unwrap();
        let value: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["configured"], false);
        assert_eq!(value["domain"], "");
        assert_eq!(value["needsOperator"], true);
        assert!(value.get("provisioningKey").is_none());
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/installation/config")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        app.db.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }
}

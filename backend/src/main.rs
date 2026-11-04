mod account;
mod bootstrap;
mod config;
mod crypto;
mod db;
mod mail;
mod policy;
mod registration;
mod stalwart;
#[cfg(test)]
mod tests;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{Duration, Utc};
use crypto::{Vault, hash, token};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Row, SqlitePool};
use stalwart::Stalwart;
use std::{collections::HashMap, sync::Arc};
use tower_http::{services::ServeDir, trace::TraceLayer};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone)]
struct App {
    db: SqlitePool,
    upstream: Stalwart,
    vault: Vault,
    origin: String,
    services: config::Services,
}
#[derive(Debug)]
struct Error(StatusCode, &'static str);
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(json!({"code":self.1,"requestId":Uuid::new_v4()})),
        )
            .into_response()
    }
}
impl From<sqlx::Error> for Error {
    fn from(_: sqlx::Error) -> Self {
        Self(StatusCode::SERVICE_UNAVAILABLE, "database_unavailable")
    }
}
impl From<stalwart::UpstreamError> for Error {
    fn from(e: stalwart::UpstreamError) -> Self {
        if matches!(e, stalwart::UpstreamError::Authentication) {
            Self(StatusCode::UNAUTHORIZED, "credentials_invalid")
        } else {
            Self(StatusCode::BAD_GATEWAY, "mail_service_unavailable")
        }
    }
}
fn internal(_: &'static str) -> Error {
    Error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "credential_storage_failed",
    )
}
type Result<T> = std::result::Result<T, Error>;

async fn revoke_user(app: &App, user: Uuid) -> Result<()> {
    let mut tx = app.db.begin().await?;
    sqlx::query("UPDATE sessions SET revoked_at=? WHERE user_id=?")
        .bind(db::now())
        .bind(user)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE user_id=?").bind(user).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

struct Identity {
    user: Uuid,
    email: String,
    account: String,
    key: String,
    session: String,
    operator: bool,
}
fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get("cookie")?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|p| {
            let (k, v) = p.trim().split_once('=')?;
            (k == name).then(|| v.to_string())
        })
}
fn same_origin(app: &App, headers: &HeaderMap) -> Result<()> {
    if headers.get("origin").and_then(|v| v.to_str().ok()) != Some(app.origin.as_str()) {
        return Err(Error(StatusCode::FORBIDDEN, "origin_invalid"));
    }
    Ok(())
}
fn client_ip(headers: &HeaderMap, peer: std::net::SocketAddr) -> std::net::IpAddr {
    let trusted = std::env::var("TRUSTED_PROXY_IPS")
        .unwrap_or_default()
        .split(',')
        .filter_map(|v| v.trim().parse::<std::net::IpAddr>().ok())
        .any(|ip| ip == peer.ip());
    if trusted
        && let Some(ip) = headers
            .get("x-real-ip")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
    {
        return ip;
    }
    peer.ip()
}
async fn identity(app: &App, headers: &HeaderMap, write: bool) -> Result<Identity> {
    identify(app, headers, write, true).await
}
async fn identify(app: &App, headers: &HeaderMap, write: bool, touch: bool) -> Result<Identity> {
    let sid = cookie(headers, "__Host-mail_session")
        .ok_or(Error(StatusCode::UNAUTHORIZED, "session_required"))?;
    let sid = hash(&sid);
    let row=sqlx::query("SELECT s.upstream_key,s.csrf_hash,u.id,u.email,u.stalwart_id,u.operator FROM sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.id_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>(CAST(unixepoch('subsec')*1000 AS INTEGER)) AND s.last_seen>(CAST(unixepoch('subsec')*1000 AS INTEGER)-1800000) AND u.status='active'")
        .bind(&sid).fetch_optional(&app.db).await?.ok_or(Error(StatusCode::UNAUTHORIZED,"session_expired"))?;
    if write {
        same_origin(app, headers)?;
        let csrf = headers
            .get("x-csrf-token")
            .and_then(|v| v.to_str().ok())
            .ok_or(Error(StatusCode::FORBIDDEN, "csrf_invalid"))?;
        if hash(csrf) != row.get::<String, _>("csrf_hash") {
            return Err(Error(StatusCode::FORBIDDEN, "csrf_invalid"));
        }
    }
    let secret: Vec<u8> = row.get("upstream_key");
    let key = String::from_utf8(app.vault.open(&secret).map_err(internal)?)
        .map_err(|_| internal("utf8"))?;
    if touch {
        sqlx::query("UPDATE sessions SET last_seen=(CAST(unixepoch('subsec')*1000 AS INTEGER)) WHERE id_hash=$1").bind(&sid).execute(&app.db).await?;
    }
    Ok(Identity {
        user: row.get("id"),
        email: row.get("email"),
        account: row.get("stalwart_id"),
        operator: row.get("operator"),
        key,
        session: sid,
    })
}

#[derive(Deserialize, ToSchema)]
struct Login {
    email: String,
    password: String,
}
#[derive(Serialize, ToSchema)]
struct SessionView {
    id: Uuid,
    email: String,
    operator: bool,
}

#[utoipa::path(post,path="/api/v1/auth/login",request_body=Login,responses((status=204,description="Session established"),(status=401,description="Invalid credentials")))]
async fn login(
    State(app): State<Arc<App>>,
    axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    Json(input): Json<Login>,
) -> Result<Response> {
    same_origin(&app, &headers)?;
    policy::rate(
        &app,
        &format!("login-ip:{}", hash(&client_ip(&headers, peer).to_string())),
        20,
        600000,
    )
    .await?;
    policy::rate(&app, "login-global", 100, 60000).await?;
    policy::rate(
        &app,
        &format!("login:{}", hash(&input.email.to_lowercase())),
        10,
        600000,
    )
    .await?;
    if input.password.len() > 512 || input.email.len() > 254 {
        return Err(Error(StatusCode::BAD_REQUEST, "input_invalid"));
    }
    let row = sqlx::query(
        "SELECT id,email,stalwart_id FROM platform_users WHERE email=$1 AND status='active'",
    )
    .bind(input.email.to_lowercase())
    .fetch_optional(&app.db)
    .await?
    .ok_or(Error(StatusCode::UNAUTHORIZED, "credentials_invalid"))?;
    let email: String = row.get("email");
    let expires = Utc::now() + Duration::hours(8);
    let id = token();
    let csrf = token();
    let result=app.upstream.password_call(&email,&input.password,"x:ApiKey/set",json!({"create":{"session":{"description":format!("mail-web:{}",hash(&id)),"expiresAt":expires.to_rfc3339(),"permissions":{"@type":"Inherit"}}}})).await?;
    let key = result["created"]["session"]["secret"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_GATEWAY, "credential_not_returned"))?;
    let keyid = result["created"]["session"]["id"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_GATEWAY, "credential_not_returned"))?;
    let secret = app.vault.seal(key.as_bytes()).map_err(internal)?;
    if let Err(e)=sqlx::query("INSERT INTO sessions(id_hash,user_id,csrf_hash,upstream_key,upstream_key_id,expires_at) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(hash(&id)).bind(row.get::<Uuid,_>("id")).bind(hash(&csrf)).bind(secret).bind(keyid).bind(expires.timestamp_millis()).execute(&app.db).await {
        let _=app.upstream.call(key,"x:ApiKey/set",json!({"destroy":[keyid]})).await;
        return Err(e.into());
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().append(
        "set-cookie",
        HeaderValue::from_str(&format!(
            "__Host-mail_session={id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800"
        ))
        .map_err(|_| internal("cookie"))?,
    );
    response.headers_mut().append(
        "set-cookie",
        HeaderValue::from_str(&format!(
            "__Host-mail_csrf={csrf}; Path=/; Secure; SameSite=Strict; Max-Age=28800"
        ))
        .map_err(|_| internal("cookie"))?,
    );
    response
        .headers_mut()
        .insert("cache-control", HeaderValue::from_static("no-store"));
    Ok(response)
}

#[utoipa::path(get,path="/api/v1/auth/session",responses((status=200,body=SessionView),(status=401,description="No active session")))]
async fn session(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<SessionView>> {
    let me = identity(&app, &headers, false).await?;
    Ok(Json(SessionView {
        id: me.user,
        email: me.email,
        operator: me.operator,
    }))
}
#[utoipa::path(post,path="/api/v1/auth/logout",responses((status=200,body=Value),(status=204,description="Completed")))]
async fn logout(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Response> {
    let me = identity(&app, &headers, true).await?;
    let mut tx = app.db.begin().await?;
    sqlx::query("UPDATE sessions SET revoked_at=(CAST(unixepoch('subsec')*1000 AS INTEGER)) WHERE id_hash=$1").bind(&me.session).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO credential_revocations(session_hash) VALUES ($1) ON CONFLICT DO NOTHING",
    )
    .bind(&me.session)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    let mut response = StatusCode::NO_CONTENT.into_response();
    for value in [
        "__Host-mail_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
        "__Host-mail_csrf=; Path=/; Secure; SameSite=Strict; Max-Age=0",
    ] {
        response
            .headers_mut()
            .append("set-cookie", HeaderValue::from_static(value));
    }
    Ok(response)
}

#[utoipa::path(get,path="/api/v1/mailboxes",responses((status=200,body=Value),(status=204,description="Completed")))]
async fn mailboxes(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    let me = identity(&app, &headers, false).await?;
    Ok(Json(
        app.upstream
            .call(&me.key, "Mailbox/get", json!({"accountId":me.account}))
            .await?,
    ))
}
#[utoipa::path(get,path="/api/v1/messages",responses((status=200,body=Value),(status=204,description="Completed")))]
async fn messages(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, false).await?;
    let mut filter = json!({});
    if let Some(mailbox) = query.get("mailbox") {
        filter["inMailbox"] = json!(mailbox);
    }
    if let Some(search) = query.get("search") {
        if search.len() > 512 {
            return Err(Error(StatusCode::BAD_REQUEST, "search_too_long"));
        }
        filter["text"] = json!(search);
    }
    let position = query
        .get("position")
        .and_then(|p| p.parse::<u32>().ok())
        .unwrap_or(0);
    let found=app.upstream.call(&me.key,"Email/query",json!({"accountId":me.account,"filter":filter,"sort":[{"property":"receivedAt","isAscending":false}],"position":position,"limit":50,"calculateTotal":true})).await?;
    let emails=app.upstream.call(&me.key,"Email/get",json!({"accountId":me.account,"ids":found["ids"],"properties":["id","threadId","mailboxIds","keywords","from","to","subject","receivedAt","preview","hasAttachment"]})).await?;
    Ok(Json(
        json!({"items":emails["list"],"total":found["total"],"state":found["queryState"]}),
    ))
}
#[utoipa::path(get,path="/api/v1/messages/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed")))]
async fn message(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, false).await?;
    let result=app.upstream.call(&me.key,"Email/get",json!({"accountId":me.account,"ids":[id],"fetchTextBodyValues":true,"fetchHTMLBodyValues":true,"properties":["htmlBody","messageId","references","id","subject","from","to","cc","receivedAt","keywords","mailboxIds","textBody","bodyValues","attachments"]})).await?;
    let msg = result["list"]
        .as_array()
        .and_then(|list| list.first())
        .ok_or(Error(StatusCode::NOT_FOUND, "message_not_found"))?;
    let mut msg = msg.clone();
    let html = msg["htmlBody"]
        .as_array()
        .and_then(|parts| parts.first())
        .and_then(|p| p["partId"].as_str())
        .and_then(|part| msg["bodyValues"][part]["value"].as_str());
    if let Some(html) = html {
        msg["safeHtml"] = json!(safe_html(html));
    }
    // Expose only the sanitized HTML; raw HTML body values never reach callers.
    if let Some(parts) = msg["htmlBody"].as_array().cloned() {
        for part in parts {
            if let Some(id) = part["partId"].as_str() {
                msg["bodyValues"][id] = Value::Null;
            }
        }
    }
    Ok(Json(msg))
}
#[derive(Deserialize, ToSchema)]
struct MessagePatch {
    read: Option<bool>,
    starred: Option<bool>,
    mailbox: Option<String>,
}
#[utoipa::path(patch,path="/api/v1/messages/{id}",params(("id"=String,Path)),request_body=MessagePatch,responses((status=200,body=Value),(status=204,description="Completed")))]
async fn update_message(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<MessagePatch>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, true).await?;
    let mut changes = json!({});
    if let Some(read) = input.read {
        changes["keywords/$seen"] = if read { json!(true) } else { Value::Null };
    }
    if let Some(starred) = input.starred {
        changes["keywords/$flagged"] = if starred { json!(true) } else { Value::Null };
    }
    if let Some(mailbox) = input.mailbox {
        let mut ids = json!({});
        ids[mailbox] = json!(true);
        changes["mailboxIds"] = ids;
    }
    let mut update = json!({});
    update[id] = changes;
    Ok(Json(
        app.upstream
            .call(
                &me.key,
                "Email/set",
                json!({"accountId":me.account,"update":update}),
            )
            .await?,
    ))
}
fn safe_html(input: &str) -> String {
    ammonia::Builder::default()
        .rm_tags(&[
            "img", "picture", "source", "style", "form", "input", "video", "audio",
        ])
        .link_rel(Some("noopener noreferrer"))
        .clean(input)
        .to_string()
}
#[utoipa::path(get,path="/api/v1/health/ready",responses((status=200,body=Value),(status=204,description="Completed")))]
async fn health(State(app): State<Arc<App>>) -> Result<Json<Value>> {
    sqlx::query("SELECT 1").execute(&app.db).await?;
    Ok(Json(json!({"status":"ok"})))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        login,
        session,
        logout,
        mailboxes,
        messages,
        message,
        update_message,
        health,
        registration::public_policy,
        registration::challenge,
        registration::verify,
        registration::availability,
        registration::register,
        registration::recover,
        account::profile,
        account::update_profile,
        account::password,
        account::sessions,
        account::revoke_session,
        account::revoke_others,
        account::app_passwords,
        account::create_app_password,
        account::delete_app_password,
        account::users,
        account::update_user,
        account::get_settings,
        account::put_settings,
        account::audit,
        account::tasks,
        mail::create_mailbox,
        mail::rename_mailbox,
        mail::delete_mailbox,
        mail::batch,
        mail::save_draft,
        mail::delete_draft,
        mail::send,
        mail::submission_status,
        mail::upload,
        mail::download,
        mail::events
    ),
    components(schemas(Login, SessionView))
)]
struct ApiDoc;

async fn revocations(app: Arc<App>) {
    loop {
        if let Ok(rows)=sqlx::query("SELECT r.session_hash,s.upstream_key,s.upstream_key_id FROM credential_revocations r JOIN sessions s ON s.id_hash=r.session_hash WHERE r.next_attempt<=(CAST(unixepoch('subsec')*1000 AS INTEGER)) LIMIT 20").fetch_all(&app.db).await {
            for row in rows {
                let sid:String=row.get("session_hash");
                let key:Vec<u8>=row.get("upstream_key");
                if let Ok(key)=app.vault.open(&key).and_then(|v|String::from_utf8(v).map_err(|_|"utf8")) {
                    let result=app.upstream.call(&key,"x:ApiKey/set",json!({"destroy":[row.get::<String,_>("upstream_key_id")]})).await;
                    if result.is_ok() || matches!(result,Err(stalwart::UpstreamError::Authentication)) {
                        let _=sqlx::query("DELETE FROM credential_revocations WHERE session_hash=$1").bind(&sid).execute(&app.db).await;
                    } else {
                        let _=sqlx::query("UPDATE credential_revocations SET attempts=attempts+1,next_attempt=(CAST(unixepoch('subsec')*1000 AS INTEGER)+60000),last_error='upstream_unavailable' WHERE session_hash=$1").bind(&sid).execute(&app.db).await;
                    }
                }
            }
        }
        if let Ok(mut tx) = app.db.begin().await {
            let _=sqlx::query("INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE revoked_at IS NULL AND (expires_at<=? OR last_seen<=?)").bind(db::now()).bind(db::now()-1800000).execute(&mut *tx).await;
            let _=sqlx::query("UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL AND (expires_at<=? OR last_seen<=?)").bind(db::now()).bind(db::now()).bind(db::now()-1800000).execute(&mut *tx).await;
            let _ = tx.commit().await;
        }
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
    }
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    use utoipa::OpenApi;
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--healthcheck") {
        reqwest::Client::new()
            .get("http://127.0.0.1:8080/api/v1/health/ready")
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await?
            .error_for_status()?;
        return Ok(());
    }
    if args.iter().any(|a| a == "--runtime-info") {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await?;
        let sqlite: String = sqlx::query_scalar("SELECT sqlite_version()")
            .fetch_one(&pool)
            .await?;
        println!(
            "{}",
            json!({"version":env!("CARGO_PKG_VERSION"),"sqlite":sqlite})
        );
        return Ok(());
    }
    if args.iter().any(|a| a == "--revoke-all-sessions") {
        let pool = db::connect(std::path::Path::new(&std::env::var("DATABASE_PATH")?)).await?;
        let mut tx = pool.begin().await?;
        sqlx::query("INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE revoked_at IS NULL").execute(&mut *tx).await?;
        sqlx::query("UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL")
            .bind(db::now())
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(());
    }
    if std::env::args().any(|a| a == "--openapi") {
        println!("{}", ApiDoc::openapi().to_pretty_json()?);
        return Ok(());
    }
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    if let Some(i) = args.iter().position(|a| a == "--backup") {
        let destination = args.get(i + 1).ok_or("backup path required")?;
        let pool = db::connect(std::path::Path::new(&std::env::var("DATABASE_PATH")?)).await?;
        db::snapshot(&pool, std::path::Path::new(destination)).await?;
        return Ok(());
    }
    let key = std::fs::read_to_string(std::env::var("SESSION_KEY_FILE")?)?;
    let vault = Vault::new(&hex::decode(key.trim())?)?;
    let db = db::connect(std::path::Path::new(
        &std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/db/mail-web.sqlite".into()),
    ))
    .await?;

    let app = Arc::new(App {
        db,
        vault,
        services: config::Services::load(),
        origin: std::env::var("PUBLIC_ORIGIN")?,
        upstream: Stalwart {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            base: std::env::var("STALWART_URL")?
                .trim_end_matches('/')
                .to_string(),
        },
    });
    if let Some(i) = args.iter().position(|a| a == "--init-operator") {
        bootstrap::operator(
            &app,
            args.get(i + 1).ok_or("operator email required")?,
            args.get(i + 2).ok_or("external recovery email required")?,
            args.get(i + 3).ok_or("initial password file required")?,
        )
        .await?;
        return Ok(());
    }
    tokio::spawn(revocations(app.clone()));
    let api = Router::new()
        .merge(registration::routes())
        .merge(account::routes())
        .merge(mail::routes())
        .route("/health/ready", get(health))
        .route("/auth/login", post(login))
        .route("/auth/session", get(session))
        .route("/auth/logout", post(logout))
        .route("/mailboxes", get(mailboxes))
        .route("/messages", get(messages))
        .route("/messages/{id}", get(message).patch(update_message));
    let routes = Router::new()
        .route("/internal/mta-hook", post(policy::hook))
        .nest("/api/v1", api)
        .fallback_service(
            ServeDir::new(
                std::env::var("STATIC_DIR").unwrap_or_else(|_| "frontend/apps/web/out".into()),
            )
            .append_index_html_on_directories(true),
        )
        .layer(axum::extract::DefaultBodyLimit::max(32 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(app);
    let listener = tokio::net::TcpListener::bind(
        std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
    )
    .await?;
    axum::serve(
        listener,
        routes.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}

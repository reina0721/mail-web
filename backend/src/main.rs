mod account;
mod bootstrap;
mod config;
mod crypto;
mod db;
mod installation;
mod logging;
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
use sqlx::Row;
use stalwart::Stalwart;
use std::{collections::HashMap, sync::Arc};
use tower_http::services::ServeDir;
use utoipa::ToSchema;
use uuid::Uuid;

static SHUTDOWN: std::sync::LazyLock<tokio_util::sync::CancellationToken> =
    std::sync::LazyLock::new(tokio_util::sync::CancellationToken::new);

#[derive(Clone)]
struct App {
    db: db::Pool,
    upstream: Stalwart,
    vault: Vault,
    origin: String,
    services: config::Services,
}
impl App {
    fn cookie_name(&self, kind: &str) -> String {
        format!(
            "{}mail_{kind}",
            if self.origin.starts_with("https://") {
                "__Host-"
            } else {
                ""
            }
        )
    }
    fn cookie_security(&self) -> &'static str {
        if self.origin.starts_with("https://") {
            "; Secure"
        } else {
            ""
        }
    }
}
#[derive(Debug)]
struct Error(StatusCode, &'static str);
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"code":self.1}))).into_response()
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

// Stalwart uses optimistic updates for the credential collection. Serialize
// account mutations within this single-instance application, including jobs.
async fn account_lock(account: &str) -> tokio::sync::MutexGuard<'static, ()> {
    static LOCKS: std::sync::LazyLock<Vec<tokio::sync::Mutex<()>>> =
        std::sync::LazyLock::new(|| (0..64).map(|_| tokio::sync::Mutex::new(())).collect());
    let bucket = account.bytes().fold(0usize, |value, byte| {
        value.wrapping_mul(31).wrapping_add(byte as usize)
    }) % LOCKS.len();
    LOCKS[bucket].lock().await
}

async fn revoke_user(app: &App, user: Uuid) -> Result<()> {
    let mut tx = db::begin(&app.db).await?;
    db::query(db::Statement::MainRevokeUserUpdateSessions)
        .bind(db::now())
        .bind(user)
        .execute(&mut *tx)
        .await?;
    db::query(db::Statement::MainRevokeUserInsertCredentialRevocations)
        .bind(user)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    account::JOB_NOTIFY.notify_one();
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
    let sid = cookie(headers, &app.cookie_name("session"))
        .ok_or(Error(StatusCode::UNAUTHORIZED, "session_required"))?;
    let sid = hash(&sid);
    let row = db::query(db::Statement::MainIdentifySelectSessions)
        .bind(&sid)
        .fetch_optional(&app.db)
        .await?
        .ok_or(Error(StatusCode::UNAUTHORIZED, "session_expired"))?;
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
        db::query(db::Statement::MainIdentifyUpdateSessions)
            .bind(&sid)
            .execute(&app.db)
            .await?;
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
    if !installation::configured(&app) {
        return Err(Error(StatusCode::SERVICE_UNAVAILABLE, "setup_required"));
    }
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
    let row = db::query(db::Statement::MainLoginSelectPlatformUsers)
        .bind(input.email.to_lowercase())
        .fetch_optional(&app.db)
        .await?
        .ok_or(Error(StatusCode::UNAUTHORIZED, "credentials_invalid"))?;
    let email: String = row.get("email");
    let _account_guard = account_lock(&row.get::<String, _>("stalwart_id")).await;
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
    let stored = db::query(db::Statement::MainLoginInsertSessions)
        .bind(hash(&id))
        .bind(row.get::<Uuid, _>("id"))
        .bind(hash(&csrf))
        .bind(secret)
        .bind(keyid)
        .bind(expires.timestamp_millis())
        .execute(&app.db)
        .await;
    if stored
        .as_ref()
        .map_or(true, |result| result.rows_affected() != 1)
    {
        let _ = app
            .upstream
            .call(key, "x:ApiKey/set", json!({"destroy":[keyid]}))
            .await;
        return Err(match stored {
            Err(error) => error.into(),
            _ => Error(StatusCode::UNAUTHORIZED, "credentials_invalid"),
        });
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().append(
        "set-cookie",
        HeaderValue::from_str(&format!(
            "{}={id}; Path=/{}; HttpOnly; SameSite=Strict; Max-Age=28800",
            app.cookie_name("session"),
            app.cookie_security()
        ))
        .map_err(|_| internal("cookie"))?,
    );
    response.headers_mut().append(
        "set-cookie",
        HeaderValue::from_str(&format!(
            "{}={csrf}; Path=/{}; SameSite=Strict; Max-Age=28800",
            app.cookie_name("csrf"),
            app.cookie_security()
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
    let me = identify(&app, &headers, false, false).await?;
    Ok(Json(SessionView {
        id: me.user,
        email: me.email,
        operator: me.operator,
    }))
}
#[utoipa::path(post,path="/api/v1/auth/logout",responses((status=200,body=Value),(status=204,description="Completed")))]
async fn logout(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Response> {
    let me = identity(&app, &headers, true).await?;
    let mut tx = db::begin(&app.db).await?;
    db::query(db::Statement::MainLogoutUpdateSessions)
        .bind(&me.session)
        .execute(&mut *tx)
        .await?;
    db::query(db::Statement::MainLogoutInsertCredentialRevocations)
        .bind(&me.session)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    account::JOB_NOTIFY.notify_one();
    let mut response = StatusCode::NO_CONTENT.into_response();
    for (kind, http_only) in [("session", "; HttpOnly"), ("csrf", "")] {
        let value = format!(
            "{}=; Path=/{}{http_only}; SameSite=Strict; Max-Age=0",
            app.cookie_name(kind),
            app.cookie_security()
        );
        response.headers_mut().append(
            "set-cookie",
            HeaderValue::from_str(&value).map_err(|_| internal("cookie"))?,
        );
    }
    Ok(response)
}

#[utoipa::path(get,path="/api/v1/mailboxes",responses((status=200,body=Value),(status=204,description="Completed")))]
async fn mailboxes(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    let me = identify(&app, &headers, false, false).await?;
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
    let me = identify(&app, &headers, false, false).await?;
    let mut filter = json!({});
    if let Some(mailbox) = query.get("mailbox") {
        filter["inMailbox"] = json!(mailbox);
    }
    if let Some(search) = query.get("search") {
        if search.len() > 512 {
            return Err(Error(StatusCode::BAD_REQUEST, "search_too_long"));
        }
        if !search.trim().is_empty() {
            filter["text"] = json!(search.trim());
        }
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
    let result=app.upstream.call(&me.key,"Email/get",json!({"accountId":me.account,"ids":[id],"fetchTextBodyValues":true,"fetchHTMLBodyValues":true,"properties":["htmlBody","messageId","references","id","subject","from","to","cc","bcc","receivedAt","keywords","mailboxIds","textBody","bodyValues","attachments"]})).await?;
    let msg = result["list"]
        .as_array()
        .and_then(|list| list.first())
        .ok_or(Error(StatusCode::NOT_FOUND, "message_not_found"))?;
    let mut msg = msg.clone();
    let plain = msg["textBody"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter(|part| part["type"] == "text/plain")
                .filter_map(|p| {
                    p["partId"]
                        .as_str()
                        .and_then(|id| msg["bodyValues"][id]["value"].as_str())
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    msg["plainText"] = json!(plain);
    if let Some(parts) = msg["attachments"].as_array() {
        let mut tx = db::begin(&app.db).await?;
        for part in parts {
            if let (Some(blob), Some(size), Some(kind)) = (
                part["blobId"].as_str(),
                part["size"].as_i64(),
                part["type"].as_str(),
            ) {
                db::query(db::Statement::MainMessageInsertUploadOwnership)
                    .bind(me.user)
                    .bind(blob)
                    .bind(size)
                    .bind(kind)
                    .bind(db::now())
                    .execute(&mut *tx)
                    .await?;
            }
        }
        tx.commit().await?;
    }

    let html = msg["htmlBody"]
        .as_array()
        // JMAP may include a text/plain part in htmlBody as a fallback.
        // Only HTML parts pass through the HTML sanitizer and iframe renderer.
        .and_then(|parts| parts.iter().find(|part| part["type"] == "text/html"))
        .and_then(|p| p["partId"].as_str())
        .and_then(|part| msg["bodyValues"][part]["value"].as_str());
    if let Some(html) = html {
        let cleaned = safe_html(html);
        if msg["plainText"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .is_empty()
        {
            msg["plainText"] = json!(html_to_plain(&cleaned));
        }
        msg["safeHtml"] = json!(cleaned);
    }
    // Expose only the sanitized HTML; raw HTML body values never reach callers.
    if let Some(parts) = msg["htmlBody"].as_array().cloned() {
        for part in parts.iter().filter(|part| part["type"] == "text/html") {
            if let Some(id) = part["partId"].as_str() {
                msg["bodyValues"][id] = Value::Null;
            }
        }
    }
    if let Some(operation) = db::query(db::Statement::MainMessageSubmission)
        .bind(me.user)
        .bind(&id)
        .fetch_optional(&app.db)
        .await?
    {
        msg["submission"] = json!({"operationId":operation.get::<Uuid,_>("id"),"status":operation.get::<String,_>("status")});
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
        .set_tag_attribute_value("a", "target", "_blank")
        .clean(input)
        .to_string()
}
fn html_to_plain(cleaned: &str) -> String {
    html2text::from_read(cleaned.as_bytes(), 100).unwrap_or_default()
}
async fn response_policy(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let request_id = Uuid::new_v4().to_string();
    let method = request.method().to_string();
    let private = request.uri().path().starts_with("/api/");
    let mut response = next.run(request).await;
    tracing::info!(request_id=%request_id,method=%method,status=response.status().as_u16(),"request_complete");
    let headers = response.headers_mut();
    if private {
        headers.insert("cache-control", HeaderValue::from_static("no-store"));
    }
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    if let Ok(value) = HeaderValue::from_str(&request_id) {
        headers.insert("x-request-id", value);
    }
    if !headers.contains_key("content-security-policy") {
        headers.insert("content-security-policy",HeaderValue::from_static("default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"));
    }
    response
}
#[utoipa::path(get,path="/api/v1/health/ready",responses((status=200,body=Value),(status=204,description="Completed")))]
async fn health(State(app): State<Arc<App>>) -> Result<Json<Value>> {
    db::query(db::Statement::MainHealthSelectValue)
        .execute(&app.db)
        .await?;
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
        installation::status,
        installation::read_config,
        installation::save_config,
        installation::enroll_operator,
        installation::discovery::discover,
        installation::initialize::authorize_temporary,
        installation::initialize::preflight,
        installation::initialize::start,
        installation::initialize::progress,
        installation::initialize::cancel,
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
        account::retry_tasks,
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

async fn revoke_upstream(app: &App, sid: &str, account: &str, cipher: &[u8], key_id: &str) -> bool {
    if let Ok(key) = app
        .vault
        .open(cipher)
        .and_then(|v| String::from_utf8(v).map_err(|_| "utf8"))
        && app
            .upstream
            .call(&key, "x:ApiKey/set", json!({"destroy":[key_id]}))
            .await
            .is_ok()
    {
        return true;
    }
    // A 401 may mean account suspension rather than deletion of the key. Use
    // the dedicated directory identity to remove the exact session credential.
    let Ok(metadata) = app
        .upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/get",
            json!({"ids":[account],"properties":["id","credentials"]}),
        )
        .await
    else {
        return false;
    };
    let mut patch = json!({});
    let description = format!("mail-web:{sid}");
    if let Some(credentials) = metadata["list"][0]["credentials"].as_object() {
        for (slot, credential) in credentials {
            if credential["@type"] == "ApiKey" && credential["description"] == description {
                patch[format!("credentials/{slot}")] = Value::Null;
            }
        }
    }
    if patch.as_object().is_none_or(|v| v.is_empty()) {
        return true;
    }
    let mut update = json!({});
    update[account] = patch;
    app.upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/set",
            json!({"update":update}),
        )
        .await
        .is_ok()
}
async fn revocations(app: Arc<App>) {
    loop {
        for _ in 0..20 {
            if !account::reconcile_job(&app).await.unwrap_or(false) {
                break;
            }
        }
        for _ in 0..20 {
            let lease = db::now() + 60000;
            let claimed =
                db::scalar::<String>(db::Statement::MainRevocationsUpdateCredentialRevocations)
                    .bind(lease)
                    .bind(db::now())
                    .bind(db::now())
                    .fetch_optional(&app.db)
                    .await;
            let Ok(Some(sid)) = claimed else { break };
            let row = db::query(db::Statement::MainRevocationsSelectSessions)
                .bind(&sid)
                .fetch_optional(&app.db)
                .await;
            if let Ok(Some(row)) = row {
                let _account_guard = account_lock(&row.get::<String, _>("stalwart_id")).await;
                if revoke_upstream(
                    &app,
                    &sid,
                    &row.get::<String, _>("stalwart_id"),
                    &row.get::<Vec<u8>, _>("upstream_key"),
                    &row.get::<String, _>("upstream_key_id"),
                )
                .await
                {
                    let _ = db::query(db::Statement::MainRevocationsDeleteCredentialRevocations)
                        .bind(&sid)
                        .bind(lease)
                        .execute(&app.db)
                        .await;
                } else {
                    let _ = db::query(db::Statement::MainRevocationsUpdateCredentialRevocations2)
                        .bind(db::now() + 60000)
                        .bind(&sid)
                        .bind(lease)
                        .execute(&app.db)
                        .await;
                }
            }
        }
        if let Ok(mut tx) = db::begin(&app.db).await {
            let _ = db::query(db::Statement::MainRevocationsInsertCredentialRevocations)
                .bind(db::now())
                .bind(db::now() - 1800000)
                .execute(&mut *tx)
                .await;
            let _ = db::query(db::Statement::MainRevocationsUpdateSessions)
                .bind(db::now())
                .bind(db::now())
                .bind(db::now() - 1800000)
                .execute(&mut *tx)
                .await;
            let _ = tx.commit().await;
        }
        tokio::select! {_=tokio::time::sleep(std::time::Duration::from_secs(30))=>{},_=account::JOB_NOTIFY.notified()=>{}}
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
        let sqlite = db::version().await?;
        println!(
            "{}",
            json!({"version":env!("CARGO_PKG_VERSION"),"sqlite":sqlite})
        );
        return Ok(());
    }
    if args.iter().any(|a| a == "--revoke-all-sessions") {
        let pool = db::connect(std::path::Path::new(&std::env::var("DATABASE_PATH")?)).await?;
        let mut tx = db::begin(&pool).await?;
        db::query(db::Statement::MainMainInsertCredentialRevocations)
            .execute(&mut *tx)
            .await?;
        db::query(db::Statement::MainMainUpdateSessions)
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
    let (log_writer, _log_guard) = tracing_appender::non_blocking(logging::LogWriter::new(
        std::path::PathBuf::from(std::env::var("LOG_DIR").unwrap_or_else(|_| "logs".into())),
    )?);
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_writer(log_writer)
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

    installation::ensure_token()?;
    let saved = installation::load(&vault)?;
    if let Some(index) = args.iter().position(|arg| arg == "--set-policy-verified") {
        let verified = match args.get(index + 1).map(String::as_str) {
            Some("true") => true,
            Some("false") => false,
            _ => return Err("use --set-policy-verified true|false".into()),
        };
        installation::set_policy_verified(&vault, verified)?;
        println!("Recorded submission policy acceptance: {verified}");
        return Ok(());
    }
    let origin = match &saved {
        Some(settings) => settings.origin.clone(),
        None => {
            if std::env::var("PUBLIC_ORIGIN").is_ok_and(|s| !s.trim().is_empty()) {
                config::origin()?
            } else {
                String::new()
            }
        }
    };
    let upstream_base = match &saved {
        Some(settings) => settings.stalwart_url.clone(),
        None => {
            if std::env::var("STALWART_URL").is_ok_and(|s| !s.trim().is_empty()) {
                config::upstream(&origin)?
            } else {
                String::new()
            }
        }
    };
    let app = Arc::new(App {
        db,
        vault,
        services: saved
            .map(|settings| settings.services)
            .unwrap_or_else(config::Services::load),
        origin,
        upstream: Stalwart {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            base: upstream_base,
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
    account::initialize_permission_policy(&app).await?;
    mail::clean_staging(std::path::Path::new(
        &std::env::var("STAGING_DIR").unwrap_or_else(|_| "data/staging".into()),
    ))
    .await?;
    if installation::configured(&app) {
        tokio::spawn(revocations(app.clone()));
    }
    let api = Router::new()
        .merge(registration::routes())
        .merge(account::routes())
        .merge(mail::routes())
        .merge(installation::routes())
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
        .layer(axum::middleware::from_fn(response_policy))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind(
        std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
    )
    .await?;
    axum::serve(
        listener,
        routes.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        #[cfg(unix)]
        {
            if let Ok(mut terminate) =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            {
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {}, _=installation::RELOAD.notified()=>{} }
            } else {
                tokio::select! {_=tokio::signal::ctrl_c()=>{},_=installation::RELOAD.notified()=>{}}
            }
        }
        #[cfg(not(unix))]
        tokio::select! {_=tokio::signal::ctrl_c()=>{},_=installation::RELOAD.notified()=>{}}
        // Long-lived mailbox event streams must close for an orderly restart.
        SHUTDOWN.cancel();
    })
    .await?;
    Ok(())
}

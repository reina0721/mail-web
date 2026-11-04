use super::*;
use rand::Rng;
use subtle::ConstantTimeEq;

pub fn routes() -> Router<Arc<App>> {
    Router::new()
        .route("/registration/policy", get(public_policy))
        .route("/registration/challenges", post(challenge))
        .route("/registration/verify", post(verify))
        .route("/registration/availability", get(availability))
        .route("/auth/register", post(register))
        .route("/auth/recovery", post(recover))
}

pub async fn settings(app: &App) -> Result<Value> {
    let value: String =
        sqlx::query_scalar("SELECT value FROM platform_settings WHERE key='registration'")
            .fetch_one(&app.db)
            .await?;
    serde_json::from_str(&value)
        .map_err(|_| Error(StatusCode::INTERNAL_SERVER_ERROR, "settings_invalid"))
}
#[utoipa::path(get,path="/api/v1/registration/policy",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn public_policy(State(app): State<Arc<App>>) -> Result<Json<Value>> {
    let p = settings(&app).await?;
    Ok(Json(
        json!({"enabled":p["enabled"]==true&&app.services.ready(),"domain":"iqwq.com","siteKey":app.services.turnstile_site_key,"maximumAccounts":p["maximumAccounts"]}),
    ))
}
fn address(input: &str) -> bool {
    input.len() <= 254
        && !input.chars().any(char::is_whitespace)
        && input.split('@').count() == 2
        && input.split('@').all(|s| !s.is_empty())
}
fn local_part(input: &str) -> bool {
    (3..=32).contains(&input.len())
        && input.as_bytes().iter().all(|b| {
            b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-')
        })
        && !input.starts_with('.')
        && !input.ends_with('.')
        && !input.contains("..")
        && !matches!(
            input,
            "admin"
                | "administrator"
                | "postmaster"
                | "abuse"
                | "root"
                | "support"
                | "security"
                | "no-reply"
                | "mail-web-service"
        )
}
async fn captcha(app: &App, token: &str) -> Result<()> {
    if app.services.turnstile_secret.is_empty() {
        return Err(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "verification_not_configured",
        ));
    }
    let response: Value = app
        .upstream
        .http
        .post("https://challenges.cloudflare.com/turnstile/v0/siteverify")
        .form(&[
            ("secret", app.services.turnstile_secret.as_str()),
            ("response", token),
        ])
        .send()
        .await
        .map_err(|_| Error(StatusCode::SERVICE_UNAVAILABLE, "verification_unavailable"))?
        .json()
        .await
        .map_err(|_| Error(StatusCode::SERVICE_UNAVAILABLE, "verification_unavailable"))?;
    let hostname = reqwest::Url::parse(&app.origin)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned));
    if response["success"] != true || response["hostname"].as_str() != hostname.as_deref() {
        return Err(Error(StatusCode::BAD_REQUEST, "captcha_invalid"));
    }
    Ok(())
}
pub async fn notify(app: &App, to: &str, subject: &str, text: &str) -> Result<()> {
    if app.services.notification_key.is_empty() {
        return Err(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "notification_not_configured",
        ));
    }
    let key = &app.services.notification_key;
    let account = &app.services.notification_account;
    let boxes = app
        .upstream
        .call(key, "Mailbox/get", json!({"accountId":account}))
        .await?;
    let drafts = boxes["list"]
        .as_array()
        .and_then(|items| items.iter().find(|b| b["role"] == "drafts"))
        .and_then(|b| b["id"].as_str())
        .ok_or(Error(StatusCode::BAD_GATEWAY, "draft_mailbox_missing"))?;
    let mut mailbox_ids = json!({});
    mailbox_ids[drafts] = json!(true);
    let created=app.upstream.call(key,"Email/set",json!({"accountId":account,"create":{"notification":{"mailboxIds":mailbox_ids,"keywords":{"$draft":true},"from":[{"email":app.services.notification_email}],"to":[{"email":to}],"subject":subject,"textBody":[{"partId":"text","type":"text/plain"}],"bodyValues":{"text":{"value":text,"isEncodingProblem":false,"isTruncated":false}}}}})).await?;
    let id = created["created"]["notification"]["id"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_GATEWAY, "notification_failed"))?;
    let identities = app
        .upstream
        .call(key, "Identity/get", json!({"accountId":account}))
        .await?;
    let identity = identities["list"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|i| i["email"] == app.services.notification_email)
        })
        .and_then(|i| i["id"].as_str())
        .ok_or(Error(
            StatusCode::BAD_GATEWAY,
            "notification_identity_missing",
        ))?;
    app.upstream.call(key,"EmailSubmission/set",json!({"accountId":account,"create":{"notification":{"emailId":id,"identityId":identity}}})).await?;
    Ok(())
}
#[derive(Deserialize, ToSchema)]
pub(super) struct ChallengeInput {
    email: String,
    purpose: String,
    turnstile_token: String,
}
#[utoipa::path(post,path="/api/v1/registration/challenges",request_body=ChallengeInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn challenge(
    State(app): State<Arc<App>>,
    axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    Json(input): Json<ChallengeInput>,
) -> Result<Json<Value>> {
    same_origin(&app, &headers)?;
    policy::rate(
        &app,
        &format!(
            "verification-ip:{}",
            hash(&client_ip(&headers, peer).to_string())
        ),
        5,
        3600000,
    )
    .await?;
    let email = input.email.trim().to_lowercase();
    if !address(&email)
        || email.ends_with("@iqwq.com")
        || !matches!(input.purpose.as_str(), "registration" | "recovery")
    {
        return Err(Error(StatusCode::BAD_REQUEST, "recovery_email_invalid"));
    }
    if input.purpose == "registration" {
        let p = settings(&app).await?;
        if p["enabled"] != true || !app.services.ready() {
            return Err(Error(StatusCode::FORBIDDEN, "registration_closed"));
        }
    }
    captcha(&app, &input.turnstile_token).await?;
    policy::rate(&app, "verification-global", 30, 3600000).await?;
    policy::rate(&app, &format!("verification:{}", hash(&email)), 1, 60000).await?;
    let id = Uuid::new_v4();
    let code = format!("{:06}", rand::thread_rng().gen_range(0..1000000));
    let digest = hash(&format!("{id}:{code}:{}", app.services.turnstile_secret));
    sqlx::query("INSERT INTO verification_challenges(id,email,purpose,code_hash,expires_at) VALUES (?,?,?,?,?)").bind(id).bind(&email).bind(&input.purpose).bind(digest).bind(db::now()+600000).execute(&app.db).await?;
    notify(
        &app,
        &email,
        "IQWQ Mail 验证码",
        &format!("你的验证码为 {code}，10 分钟内有效。如非本人操作，请忽略此邮件。"),
    )
    .await?;
    Ok(Json(json!({"challengeId":id})))
}
#[derive(Deserialize, ToSchema)]
pub(super) struct VerifyInput {
    challenge_id: Uuid,
    code: String,
}
#[utoipa::path(post,path="/api/v1/registration/verify",request_body=VerifyInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn verify(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<VerifyInput>,
) -> Result<Json<Value>> {
    same_origin(&app, &headers)?;
    let row=sqlx::query("UPDATE verification_challenges SET attempts=attempts+1 WHERE id=? AND expires_at>? AND attempts<5 AND consumed_at IS NULL AND verified_at IS NULL RETURNING code_hash")
        .bind(input.challenge_id).bind(db::now()).fetch_optional(&app.db).await?.ok_or(Error(StatusCode::BAD_REQUEST,"challenge_expired"))?;
    let digest = hash(&format!(
        "{}:{}:{}",
        input.challenge_id, input.code, app.services.turnstile_secret
    ));
    if !bool::from(
        digest
            .as_bytes()
            .ct_eq(row.get::<String, _>("code_hash").as_bytes()),
    ) {
        return Err(Error(StatusCode::BAD_REQUEST, "code_invalid"));
    }
    let claim = token();
    let updated=sqlx::query("UPDATE verification_challenges SET verified_at=?,claim_hash=? WHERE id=? AND verified_at IS NULL AND consumed_at IS NULL").bind(db::now()).bind(hash(&claim)).bind(input.challenge_id).execute(&app.db).await?;
    if updated.rows_affected() != 1 {
        return Err(Error(StatusCode::CONFLICT, "challenge_already_used"));
    }
    Ok(Json(
        json!({"challengeId":input.challenge_id,"verificationToken":claim}),
    ))
}
#[utoipa::path(get,path="/api/v1/registration/availability",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn availability(
    State(app): State<Arc<App>>,
    Query(q): Query<HashMap<String, String>>,
) -> Result<Json<Value>> {
    policy::rate(&app, "availability-global", 120, 60000).await?;
    let name = q.get("name").map(String::as_str).unwrap_or("");
    if !local_part(name) {
        return Ok(Json(json!({"available":false})));
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM platform_users WHERE email=?")
        .bind(format!("{name}@iqwq.com"))
        .fetch_one(&app.db)
        .await?;
    Ok(Json(json!({"available":count==0})))
}
#[derive(Deserialize, ToSchema)]
pub(super) struct Register {
    challenge_id: Uuid,
    verification_token: String,
    name: String,
    password: String,
}
#[utoipa::path(post,path="/api/v1/auth/register",request_body=Register,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn register(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Register>,
) -> Result<StatusCode> {
    same_origin(&app, &headers)?;
    let p = settings(&app).await?;
    if p["enabled"] != true || !app.services.ready() {
        return Err(Error(StatusCode::FORBIDDEN, "registration_closed"));
    }
    if !local_part(&input.name) || !(12..=128).contains(&input.password.chars().count()) {
        return Err(Error(StatusCode::BAD_REQUEST, "registration_input_invalid"));
    }
    let email = format!("{}@iqwq.com", input.name);
    let mut tx = app.db.begin_with("BEGIN IMMEDIATE").await?;
    let challenge=sqlx::query("SELECT email FROM verification_challenges WHERE id=? AND purpose='registration' AND claim_hash=? AND verified_at IS NOT NULL AND expires_at>?")
        .bind(input.challenge_id).bind(hash(&input.verification_token)).bind(db::now()).fetch_optional(&mut *tx).await?.ok_or(Error(StatusCode::BAD_REQUEST,"verification_required"))?;
    let existing = sqlx::query("SELECT id,email,status FROM platform_users WHERE challenge_id=? OR (email=? AND recovery_email=? AND status='provisioning')")
        .bind(input.challenge_id).bind(&email).bind(challenge.get::<String,_>("email"))
        .fetch_optional(&mut *tx)
        .await?;
    let user = if let Some(row) = existing {
        if row.get::<String, _>("email") != email {
            return Err(Error(StatusCode::CONFLICT, "registration_conflict"));
        }
        if row.get::<String, _>("status") == "active" {
            return Ok(StatusCode::NO_CONTENT);
        }
        row.get::<Uuid, _>("id")
    } else {
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM platform_users WHERE operator=0")
            .fetch_one(&mut *tx)
            .await?;
        if count >= p["maximumAccounts"].as_i64().unwrap_or(100) {
            return Err(Error(StatusCode::FORBIDDEN, "registration_full"));
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO platform_users(id,email,recovery_email,status,challenge_id) VALUES (?,?,?,'provisioning',?)").bind(id).bind(&email).bind(challenge.get::<String,_>("email")).bind(input.challenge_id).execute(&mut *tx).await.map_err(|_|Error(StatusCode::CONFLICT,"address_unavailable"))?;
        id
    };
    let leased=sqlx::query("UPDATE platform_users SET provisioning_lease=?,challenge_id=? WHERE id=? AND provisioning_lease<=?").bind(db::now()+180000).bind(input.challenge_id).bind(user).bind(db::now()).execute(&mut *tx).await?;
    if leased.rows_affected() != 1 {
        return Err(Error(
            StatusCode::CONFLICT,
            "registration_in_progress_retry_later",
        ));
    }
    tx.commit().await?;
    // A retry may only adopt a mailbox after proving the submitted password and
    // matching the unguessable provisioning marker recorded in the account.
    let marker = format!("mail-web:{user}");
    let found = app
        .upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/query",
            json!({"filter":{"name":input.name}}),
        )
        .await?;
    let ids = found["ids"].as_array().cloned().unwrap_or_default();
    let mut upstream_id = None;
    if !ids.is_empty() {
        let records = app
            .upstream
            .call(
                &app.services.provisioning_key,
                "x:Account/get",
                json!({"ids":ids,"properties":["id","emailAddress","description"]}),
            )
            .await?;
        if let Some(record) = records["list"]
            .as_array()
            .and_then(|items| items.iter().find(|a| a["emailAddress"] == email))
        {
            if record["description"] != marker {
                return Err(Error(StatusCode::CONFLICT, "upstream_address_exists"));
            }
            upstream_id = record["id"].as_str().map(str::to_owned);
        }
    }
    if upstream_id.is_none() {
        let created=app.upstream.call(&app.services.provisioning_key,"x:Account/set",json!({"create":{"user":{"@type":"User","name":input.name,"domainId":app.services.domain_id,"description":marker,"permissions":{"@type":"Merge","disabledPermissions":{"authenticate":true,"emailSend":true}},"roles":{"@type":"User"},"credentials":{"0":{"@type":"Password","secret":input.password}},"diskQuota":p["quotaBytes"].as_i64().unwrap_or(1073741824)}}})).await?;
        upstream_id = created["created"]["user"]["id"].as_str().map(str::to_owned);
    }
    let upstream_id = upstream_id.ok_or(Error(
        StatusCode::BAD_GATEWAY,
        "provisioning_result_unknown",
    ))?;
    sqlx::query("UPDATE platform_users SET stalwart_id=? WHERE id=? AND status='provisioning'")
        .bind(&upstream_id)
        .bind(user)
        .execute(&app.db)
        .await?;
    policy::sync_scope(&app).await?;
    let mut activation = json!({});
    activation[&upstream_id] = json!({"permissions":{"@type":"Inherit"}});
    app.upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/set",
            json!({"update":activation}),
        )
        .await?;
    app.upstream
        .password_call(&email, &input.password, "Core/echo", json!({"proof":true}))
        .await?;
    let mut tx = app.db.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("UPDATE platform_users SET stalwart_id=?,status='active',provisioning_lease=0 WHERE id=? AND status='provisioning'").bind(upstream_id).bind(user).execute(&mut *tx).await?;
    sqlx::query("UPDATE verification_challenges SET consumed_at=? WHERE id=?")
        .bind(db::now())
        .bind(input.challenge_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize, ToSchema)]
pub(super) struct Recovery {
    challenge_id: Uuid,
    verification_token: String,
    password: String,
}
#[utoipa::path(post,path="/api/v1/auth/recovery",request_body=Recovery,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn recover(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Recovery>,
) -> Result<StatusCode> {
    same_origin(&app, &headers)?;
    if !(12..=128).contains(&input.password.chars().count()) {
        return Err(Error(StatusCode::BAD_REQUEST, "password_invalid"));
    }
    let row=sqlx::query("UPDATE verification_challenges SET consumed_at=? WHERE id=? AND purpose='recovery' AND claim_hash=? AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at>? RETURNING email")
        .bind(db::now()).bind(input.challenge_id).bind(hash(&input.verification_token)).bind(db::now()).fetch_optional(&app.db).await?.ok_or(Error(StatusCode::BAD_REQUEST,"verification_required"))?;
    if let Some(user) = sqlx::query(
        "SELECT id,stalwart_id FROM platform_users WHERE recovery_email=? AND status='active'",
    )
    .bind(row.get::<String, _>("email"))
    .fetch_optional(&app.db)
    .await?
    {
        let user_id: Uuid = user.get("id");
        let upstream: String = user.get("stalwart_id");
        // Revoke platform access before making an upstream password change.
        super::revoke_user(&app, user_id).await?;
        let mut update = json!({});
        update[upstream] = json!({"credentials/0/secret":input.password});
        app.upstream
            .call(
                &app.services.provisioning_key,
                "x:Account/set",
                json!({"update":update}),
            )
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reserved_and_invalid_addresses() {
        for name in [
            "admin",
            "abuse",
            "postmaster",
            "a..b",
            ".abc",
            "abc.",
            "a/b",
            "ABC",
            "",
        ] {
            assert!(!local_part(name));
        }
        assert!(local_part("hello-world"));
        assert!(!address("bad\r\n@example.com"));
    }
}

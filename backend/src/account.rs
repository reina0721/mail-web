use super::*;
pub fn routes() -> Router<Arc<App>> {
    Router::new()
        .route("/account", get(profile).patch(update_profile))
        .route("/auth/password", post(password))
        .route("/auth/sessions", get(sessions))
        .route("/auth/sessions/{id}", axum::routing::delete(revoke_session))
        .route("/auth/sessions/revoke-others", post(revoke_others))
        .route(
            "/account/app-passwords",
            get(app_passwords).post(create_app_password),
        )
        .route(
            "/account/app-passwords/{id}",
            axum::routing::delete(delete_app_password),
        )
        .route("/admin/users", get(users))
        .route("/admin/users/{id}", axum::routing::patch(update_user))
        .route("/admin/registration", get(get_settings).patch(put_settings))
        .route("/admin/audit", get(audit))
        .route("/admin/tasks", get(tasks))
}
pub async fn audit_event(
    app: &App,
    actor: Uuid,
    action: &str,
    subject: Uuid,
    outcome: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO audit_events(id,actor_id,action,subject_id,outcome) VALUES (?,?,?,?,?)",
    )
    .bind(Uuid::new_v4())
    .bind(actor)
    .bind(action)
    .bind(subject)
    .bind(outcome)
    .execute(&app.db)
    .await?;
    Ok(())
}
async fn operator(app: &App, headers: &HeaderMap, write: bool) -> Result<Identity> {
    let me = identity(app, headers, write).await?;
    if !me.operator {
        return Err(Error(StatusCode::FORBIDDEN, "operator_required"));
    }
    Ok(me)
}
#[utoipa::path(get,path="/api/v1/account",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn profile(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, false).await?;
    let row =
        sqlx::query("SELECT display_name,preferences,quota_bytes FROM platform_users WHERE id=?")
            .bind(me.user)
            .fetch_one(&app.db)
            .await?;
    let metadata = app
        .upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/get",
            json!({"ids":[me.account],"properties":["id","diskQuota","usedDiskQuota"]}),
        )
        .await?;
    Ok(Json(
        json!({"email":me.email,"displayName":row.get::<String,_>("display_name"),"preferences":serde_json::from_str::<Value>(&row.get::<String,_>("preferences")).unwrap_or(json!({})),"quotaBytes":row.get::<i64,_>("quota_bytes"),"usedBytes":metadata["list"][0]["usedDiskQuota"]}),
    ))
}
#[derive(Deserialize, ToSchema)]
pub(super) struct ProfileInput {
    display_name: String,
    language: String,
    theme: String,
}
#[utoipa::path(patch,path="/api/v1/account",request_body=ProfileInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn update_profile(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<ProfileInput>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    if input.display_name.chars().count() > 100
        || !matches!(input.language.as_str(), "zh-CN" | "en")
        || !matches!(input.theme.as_str(), "system" | "light" | "dark")
    {
        return Err(Error(StatusCode::BAD_REQUEST, "profile_invalid"));
    }
    sqlx::query("UPDATE platform_users SET display_name=?,preferences=? WHERE id=?")
        .bind(input.display_name)
        .bind(json!({"language":input.language,"theme":input.theme}).to_string())
        .bind(me.user)
        .execute(&app.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize, ToSchema)]
pub(super) struct PasswordInput {
    current_password: String,
    new_password: String,
}
#[utoipa::path(post,path="/api/v1/auth/password",request_body=PasswordInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn password(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<PasswordInput>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    if !(12..=128).contains(&input.new_password.chars().count()) {
        return Err(Error(StatusCode::BAD_REQUEST, "password_invalid"));
    }
    app.upstream
        .password_call(&me.email, &input.current_password, "Core/echo", json!({}))
        .await?;
    revoke_user(&app, me.user).await?;
    app.upstream.password_call(&me.email,&input.current_password,"x:AccountPassword/set",json!({"update":{"singleton":{"currentSecret":input.current_password,"secret":input.new_password}}})).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/auth/sessions",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn sessions(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, false).await?;
    let rows=sqlx::query("SELECT id_hash,created_at,last_seen,expires_at FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND last_seen>?").bind(me.user).bind(db::now()).bind(db::now()-1800000).fetch_all(&app.db).await?;
    Ok(Json(
        json!({"items":rows.iter().map(|r|json!({"id":r.get::<String,_>("id_hash"),"current":r.get::<String,_>("id_hash")==me.session,"createdAt":r.get::<i64,_>("created_at"),"lastSeen":r.get::<i64,_>("last_seen"),"expiresAt":r.get::<i64,_>("expires_at")})).collect::<Vec<_>>()}),
    ))
}
#[utoipa::path(delete,path="/api/v1/auth/sessions/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn revoke_session(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    let mut tx = app.db.begin().await?;
    sqlx::query("UPDATE sessions SET revoked_at=? WHERE id_hash=? AND user_id=?")
        .bind(db::now())
        .bind(&id)
        .bind(me.user)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE id_hash=? AND user_id=?").bind(id).bind(me.user).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/v1/auth/sessions/revoke-others",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn revoke_others(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    let mut tx = app.db.begin().await?;
    sqlx::query("UPDATE sessions SET revoked_at=? WHERE user_id=? AND id_hash<>?")
        .bind(db::now())
        .bind(me.user)
        .bind(&me.session)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE user_id=? AND id_hash<>? AND revoked_at IS NOT NULL").bind(me.user).bind(me.session).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/account/app-passwords",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn app_passwords(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, false).await?;
    Ok(Json(
        app.upstream
            .call(
                &me.key,
                "x:AppPassword/get",
                json!({"properties":["id","description","createdAt","expiresAt"]}),
            )
            .await?,
    ))
}
#[derive(Deserialize, ToSchema)]
pub(super) struct CredentialInput {
    description: String,
}
#[utoipa::path(post,path="/api/v1/account/app-passwords",request_body=CredentialInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn create_app_password(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<CredentialInput>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, true).await?;
    if input.description.is_empty() || input.description.len() > 100 {
        return Err(Error(StatusCode::BAD_REQUEST, "description_invalid"));
    }
    Ok(Json(app.upstream.call(&me.key,"x:AppPassword/set",json!({"create":{"credential":{"description":input.description,"permissions":{"@type":"Inherit"}}}})).await?))
}
#[utoipa::path(delete,path="/api/v1/account/app-passwords/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn delete_app_password(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    app.upstream
        .call(&me.key, "x:AppPassword/set", json!({"destroy":[id]}))
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/admin/users",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn users(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    let rows=sqlx::query("SELECT id,email,status,operator,quota_bytes,hourly_recipients,daily_recipients FROM platform_users ORDER BY created_at DESC LIMIT 200").fetch_all(&app.db).await?;
    Ok(Json(
        json!({"items":rows.iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"email":r.get::<String,_>("email"),"status":r.get::<String,_>("status"),"operator":r.get::<bool,_>("operator"),"quotaBytes":r.get::<i64,_>("quota_bytes"),"hourlyRecipients":r.get::<i64,_>("hourly_recipients"),"dailyRecipients":r.get::<i64,_>("daily_recipients")})).collect::<Vec<_>>()}),
    ))
}
#[derive(Deserialize, ToSchema)]
pub(super) struct UserInput {
    enabled: bool,
    quota_bytes: i64,
    hourly_recipients: i64,
    daily_recipients: i64,
}
#[utoipa::path(patch,path="/api/v1/admin/users/{id}",params(("id"=String,Path)),request_body=UserInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn update_user(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<UserInput>,
) -> Result<StatusCode> {
    let me = operator(&app, &headers, true).await?;
    if id == me.user && !input.enabled {
        return Err(Error(StatusCode::BAD_REQUEST, "cannot_disable_self"));
    }
    if input.quota_bytes <= 0
        || input.hourly_recipients <= 0
        || input.daily_recipients < input.hourly_recipients
    {
        return Err(Error(StatusCode::BAD_REQUEST, "limits_invalid"));
    }
    let row = sqlx::query(
        "SELECT stalwart_id FROM platform_users WHERE id=? AND status IN ('active','disabled')",
    )
    .bind(id)
    .fetch_optional(&app.db)
    .await?
    .ok_or(Error(StatusCode::NOT_FOUND, "user_not_found"))?;
    if !input.enabled {
        revoke_user(&app, id).await?;
        sqlx::query("UPDATE platform_users SET status='disabled' WHERE id=?")
            .bind(id)
            .execute(&app.db)
            .await?;
    }
    let mut update = json!({});
    update[row.get::<String, _>("stalwart_id")] = json!({"diskQuota":input.quota_bytes,"permissions":if input.enabled{json!({"@type":"Inherit"})}else{json!({"@type":"Merge","disabledPermissions":{"authenticate":true,"emailSend":true}})}});
    app.upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/set",
            json!({"update":update}),
        )
        .await?;
    sqlx::query("UPDATE platform_users SET status=?,quota_bytes=?,hourly_recipients=?,daily_recipients=? WHERE id=?").bind(if input.enabled{"active"}else{"disabled"}).bind(input.quota_bytes).bind(input.hourly_recipients).bind(input.daily_recipients).bind(id).execute(&app.db).await?;
    audit_event(&app, me.user, "account.update", id, "success").await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/admin/registration",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn get_settings(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    Ok(Json(
        json!({"policy":registration::settings(&app).await?,"dependenciesReady":app.services.ready()}),
    ))
}
#[utoipa::path(patch,path="/api/v1/admin/registration",request_body=Value,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn put_settings(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Value>,
) -> Result<StatusCode> {
    let me = operator(&app, &headers, true).await?;
    if !input["enabled"].is_boolean()
        || !(1..=100).contains(&input["maximumAccounts"].as_i64().unwrap_or(0))
        || input["quotaBytes"].as_i64().unwrap_or(0) <= 0
    {
        return Err(Error(StatusCode::BAD_REQUEST, "policy_invalid"));
    }
    if input["enabled"] == true && !app.services.ready() {
        return Err(Error(
            StatusCode::CONFLICT,
            "registration_dependencies_missing",
        ));
    }
    sqlx::query("UPDATE platform_settings SET value=? WHERE key='registration'")
        .bind(input.to_string())
        .execute(&app.db)
        .await?;
    audit_event(&app, me.user, "registration.update", me.user, "success").await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/admin/audit",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn audit(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    let rows = sqlx::query(
        "SELECT id,action,outcome,created_at FROM audit_events ORDER BY created_at DESC LIMIT 200",
    )
    .fetch_all(&app.db)
    .await?;
    Ok(Json(
        json!({"items":rows.iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"action":r.get::<String,_>("action"),"outcome":r.get::<String,_>("outcome"),"createdAt":r.get::<i64,_>("created_at")})).collect::<Vec<_>>()}),
    ))
}
#[utoipa::path(get,path="/api/v1/admin/tasks",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn tasks(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM credential_revocations")
        .fetch_one(&app.db)
        .await?;
    let reconciliation: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM platform_users WHERE status IN ('provisioning','reconcile')",
    )
    .fetch_one(&app.db)
    .await?;
    Ok(Json(
        json!({"credentialRevocations":pending,"registrationReconciliation":reconciliation}),
    ))
}

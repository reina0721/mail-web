use super::*;
pub(super) static JOB_NOTIFY: tokio::sync::Notify = tokio::sync::Notify::const_new();
pub fn user_permissions(active: bool) -> Value {
    // Mail-only first release. In particular, Sieve redirects, vacation replies,
    // calendar invitations and alias sign-ins must not open alternate send paths.
    const ALLOWED: &[&str] = &[
        "authenticate",
        "emailSend",
        "emailReceive",
        "imapAuthenticate",
        "imapAclGet",
        "imapAclSet",
        "imapMyRights",
        "imapListRights",
        "imapAppend",
        "imapCapability",
        "imapId",
        "imapCopy",
        "imapMove",
        "imapCreate",
        "imapDelete",
        "imapEnable",
        "imapExpunge",
        "imapFetch",
        "imapIdle",
        "imapList",
        "imapLsub",
        "imapNamespace",
        "imapRename",
        "imapSearch",
        "imapSort",
        "imapSelect",
        "imapExamine",
        "imapStatus",
        "imapStore",
        "imapSubscribe",
        "imapThread",
        "imapMetadataGet",
        "imapMetadataSet",
        "imapMetadataPrivate",
        "pop3Authenticate",
        "pop3List",
        "pop3Uidl",
        "pop3Stat",
        "pop3Retr",
        "pop3Dele",
        "jmapCoreEcho",
        "jmapBlobGet",
        "jmapBlobCopy",
        "jmapBlobLookup",
        "jmapBlobUpload",
        "jmapEmailGet",
        "jmapEmailChanges",
        "jmapEmailQuery",
        "jmapEmailQueryChanges",
        "jmapEmailCreate",
        "jmapEmailUpdate",
        "jmapEmailDestroy",
        "jmapEmailCopy",
        "jmapEmailImport",
        "jmapEmailParse",
        "jmapEmailSubmissionGet",
        "jmapEmailSubmissionChanges",
        "jmapEmailSubmissionQuery",
        "jmapEmailSubmissionQueryChanges",
        "jmapEmailSubmissionCreate",
        "jmapEmailSubmissionUpdate",
        "jmapEmailSubmissionDestroy",
        "jmapIdentityGet",
        "jmapIdentityChanges",
        "jmapMailboxGet",
        "jmapMailboxChanges",
        "jmapMailboxQuery",
        "jmapMailboxQueryChanges",
        "jmapMailboxCreate",
        "jmapMailboxUpdate",
        "jmapMailboxDestroy",
        "jmapThreadGet",
        "jmapThreadChanges",
        "jmapSearchSnippetGet",
        "jmapQuotaGet",
        "jmapQuotaChanges",
        "jmapQuotaQuery",
        "jmapQuotaQueryChanges",
        "sysAccountSettingsGet",
        "sysAccountPasswordGet",
        "sysAccountPasswordUpdate",
        "sysApiKeyGet",
        "sysApiKeyCreate",
        "sysApiKeyUpdate",
        "sysApiKeyDestroy",
        "sysApiKeyQuery",
        "sysAppPasswordGet",
        "sysAppPasswordCreate",
        "sysAppPasswordUpdate",
        "sysAppPasswordDestroy",
        "sysAppPasswordQuery",
    ];
    let enabled: serde_json::Map<String, Value> = ALLOWED
        .iter()
        .map(|name| ((*name).into(), json!(true)))
        .collect();
    json!({"@type":"Replace","enabledPermissions":enabled,"disabledPermissions":if active{json!({})}else{json!({"authenticate":true,"emailSend":true})}})
}
pub async fn initialize_permission_policy(app: &App) -> std::result::Result<(), sqlx::Error> {
    let mut tx = db::begin(&app.db).await?;
    let version: Option<String> = db::scalar(db::Statement::AccountInitializePolicyVersion)
        .fetch_optional(&mut *tx)
        .await?;
    if version.as_deref() != Some("1") {
        let users = db::query(db::Statement::AccountInitializePolicyUsers)
            .fetch_all(&mut *tx)
            .await?;
        for user in users {
            let id: Uuid = user.get("id");
            let payload=json!({"account":user.get::<String,_>("stalwart_id"),"enabled":user.get::<String,_>("status")=="active","quota":user.get::<i64,_>("quota_bytes")}).to_string();
            db::query(db::Statement::AccountInitializePolicyJob)
                .bind(format!("account:{id}"))
                .bind(id)
                .bind(payload)
                .execute(&mut *tx)
                .await?;
        }
        db::query(db::Statement::AccountInitializePolicyCommit)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
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
        .route("/admin/tasks/retry", post(retry_tasks))
}
pub async fn audit_event(
    app: &App,
    actor: Uuid,
    action: &str,
    subject: Uuid,
    outcome: &str,
) -> Result<()> {
    db::query(db::Statement::AccountAuditEventInsertAuditEvents)
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
    let row = db::query(db::Statement::AccountProfileSelectPlatformUsers)
        .bind(me.user)
        .fetch_one(&app.db)
        .await?;
    let metadata = app
        .upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/get",
            json!({"ids":[me.account],"properties":["id","quotas","usedDiskQuota"]}),
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
    db::query(db::Statement::AccountUpdateProfileUpdatePlatformUsers)
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
    let _account_guard = account_lock(&me.account).await;
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
    let rows = db::query(db::Statement::AccountSessionsSelectSessions)
        .bind(me.user)
        .bind(db::now())
        .bind(db::now() - 1800000)
        .fetch_all(&app.db)
        .await?;
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
    let mut tx = db::begin(&app.db).await?;
    db::query(db::Statement::AccountRevokeSessionUpdateSessions)
        .bind(db::now())
        .bind(&id)
        .bind(me.user)
        .execute(&mut *tx)
        .await?;
    db::query(db::Statement::AccountRevokeSessionInsertCredentialRevocations)
        .bind(id)
        .bind(me.user)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    JOB_NOTIFY.notify_one();
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/v1/auth/sessions/revoke-others",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn revoke_others(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    let mut tx = db::begin(&app.db).await?;
    db::query(db::Statement::AccountRevokeOthersUpdateSessions)
        .bind(db::now())
        .bind(me.user)
        .bind(&me.session)
        .execute(&mut *tx)
        .await?;
    db::query(db::Statement::AccountRevokeOthersInsertCredentialRevocations)
        .bind(me.user)
        .bind(me.session)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    JOB_NOTIFY.notify_one();
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
    let _account_guard = account_lock(&me.account).await;
    if input.description.is_empty() || input.description.len() > 100 {
        return Err(Error(StatusCode::BAD_REQUEST, "description_invalid"));
    }
    Ok(Json(app.upstream.call(&me.key,"x:AppPassword/set",json!({"create":{"credential":{"description":input.description,"permissions":{"@type":"Disable","permissions":{"sysApiKeyCreate":true,"sysApiKeyUpdate":true,"sysApiKeyDestroy":true,"sysAppPasswordCreate":true,"sysAppPasswordUpdate":true,"sysAppPasswordDestroy":true,"sysAccountPasswordUpdate":true}}}}})).await?))
}
#[utoipa::path(delete,path="/api/v1/account/app-passwords/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn delete_app_password(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    let _account_guard = account_lock(&me.account).await;
    app.upstream
        .call(&me.key, "x:AppPassword/set", json!({"destroy":[id]}))
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/admin/users",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn users(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    let rows = db::query(db::Statement::AccountUsersSelectPlatformUsers)
        .fetch_all(&app.db)
        .await?;
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
#[utoipa::path(patch,path="/api/v1/admin/users/{id}",params(("id"=String,Path)),request_body=UserInput,responses((status=202,description="Policy queued for durable synchronization"),(status=401,description="Session required"),(status=403,description="Denied")))]
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
    let row = db::query(db::Statement::AccountUpdateUserSelectPlatformUsers)
        .bind(id)
        .fetch_optional(&app.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "user_not_found"))?;
    let payload=json!({"account":row.get::<String,_>("stalwart_id"),"enabled":input.enabled,"quota":input.quota_bytes}).to_string();
    let mut tx = db::begin(&app.db).await?;
    db::query(db::Statement::AccountUpdateUserUpdatePlatformUsers)
        .bind(input.enabled)
        .bind(input.quota_bytes)
        .bind(input.hourly_recipients)
        .bind(input.daily_recipients)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    db::query(db::Statement::AccountUpdateUserInsertCredentialJobs)
        .bind(format!("account:{id}"))
        .bind(id)
        .bind(payload)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    if !input.enabled {
        revoke_user(&app, id).await?;
    }
    JOB_NOTIFY.notify_one();
    audit_event(&app, me.user, "account.update", id, "queued").await?;
    Ok(StatusCode::ACCEPTED)
}

pub(super) async fn reconcile_job(app: &App) -> Result<bool> {
    let lease = db::now() + 60000;
    let row = db::query(db::Statement::AccountReconcileJobUpdateCredentialJobs)
        .bind(lease)
        .bind(db::now())
        .bind(db::now())
        .fetch_optional(&app.db)
        .await?;
    let Some(row) = row else { return Ok(false) };
    let id: String = row.get("id");
    let user: Uuid = row.get("user_id");
    let payload: String = row.get("payload");
    let data: Value = serde_json::from_str(&payload).map_err(|_| internal("job_payload"))?;
    let _account_guard =
        account_lock(data["account"].as_str().ok_or(internal("job_account"))?).await;
    let enabled = data["enabled"] == true;
    let mut revocation_ready = true;
    if enabled {
        let sessions = db::query(db::Statement::AccountReconcileJobSelectSessions)
            .bind(user)
            .fetch_all(&app.db)
            .await?;
        for session in sessions {
            let sid: String = session.get("id_hash");
            if super::revoke_upstream(
                app,
                &sid,
                data["account"].as_str().ok_or(internal("job_account"))?,
                &session.get::<Vec<u8>, _>("upstream_key"),
                &session.get::<String, _>("upstream_key_id"),
            )
            .await
            {
                db::query(db::Statement::AccountReconcileJobDeleteCredentialRevocations)
                    .bind(sid)
                    .execute(&app.db)
                    .await?;
            } else {
                revocation_ready = false;
                break;
            }
        }
    }
    let mut update = json!({});
    update[data["account"].as_str().ok_or(internal("job_account"))?] =
        json!({"quotas/maxDiskQuota":data["quota"],"permissions":user_permissions(enabled)});
    let result = if revocation_ready {
        app.upstream
            .call(
                &app.services.provisioning_key,
                "x:Account/set",
                json!({"update":update}),
            )
            .await
    } else {
        Err(stalwart::UpstreamError::Rejected)
    };
    if result.is_ok() {
        let mut tx = db::begin(&app.db).await?;
        let current: bool = db::scalar(db::Statement::AccountReconcileJobSelectCredentialJobs)
            .bind(&id)
            .bind(lease)
            .bind(&payload)
            .fetch_one(&mut *tx)
            .await?;
        if current {
            db::query(db::Statement::AccountReconcileJobUpdatePlatformUsers)
                .bind(if enabled { "active" } else { "disabled" })
                .bind(user)
                .execute(&mut *tx)
                .await?;
            db::query(db::Statement::AccountReconcileJobDeleteCredentialJobs)
                .bind(&id)
                .bind(lease)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
    } else {
        db::query(db::Statement::AccountReconcileJobUpdateCredentialJobs2)
            .bind(db::now() + 60000)
            .bind(&id)
            .bind(lease)
            .execute(&app.db)
            .await?;
    }
    Ok(true)
}
#[utoipa::path(get,path="/api/v1/admin/registration",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn get_settings(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    Ok(Json(
        json!({"policy":registration::settings(&app).await?,"dependenciesReady":readiness::ready(&app).await?,"readiness":readiness::view(&app).await?}),
    ))
}
#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct RegistrationPolicy {
    enabled: bool,
    maximum_accounts: i64,
    quota_bytes: i64,
    attachment_bytes: i64,
    hourly_recipients: i64,
    daily_recipients: i64,
}
#[utoipa::path(patch,path="/api/v1/admin/registration",request_body=RegistrationPolicy,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn put_settings(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<RegistrationPolicy>,
) -> Result<StatusCode> {
    let me = operator(&app, &headers, true).await?;
    if !(1..=100).contains(&input.maximum_accounts)
        || input.quota_bytes <= 0
        || !(1..=20971520).contains(&input.attachment_bytes)
        || !(1..=10000).contains(&input.hourly_recipients)
        || !(1..=100000).contains(&input.daily_recipients)
        || input.daily_recipients < input.hourly_recipients
    {
        return Err(Error(StatusCode::BAD_REQUEST, "policy_invalid"));
    }
    if input.enabled {
        readiness::check(&app).await?;
    }
    if input.enabled && !readiness::ready(&app).await? {
        return Err(Error(
            StatusCode::CONFLICT,
            "registration_dependencies_missing",
        ));
    }
    db::query(db::Statement::AccountPutSettingsUpdatePlatformSettings)
        .bind(serde_json::to_string(&input).map_err(|_| internal("policy"))?)
        .execute(&app.db)
        .await?;
    audit_event(&app, me.user, "registration.update", me.user, "success").await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/admin/audit",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn audit(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    let rows = db::query(db::Statement::AccountAuditSelectAuditEvents)
        .fetch_all(&app.db)
        .await?;
    Ok(Json(
        json!({"items":rows.iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"actorId":r.get::<Option<Uuid>,_>("actor_id"),"subjectId":r.get::<Option<Uuid>,_>("subject_id"),"action":r.get::<String,_>("action"),"outcome":r.get::<String,_>("outcome"),"createdAt":r.get::<i64,_>("created_at")})).collect::<Vec<_>>()}),
    ))
}
#[utoipa::path(get,path="/api/v1/admin/tasks",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn tasks(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    operator(&app, &headers, false).await?;
    let pending: i64 = db::scalar(db::Statement::AccountTasksSelectCredentialRevocations)
        .fetch_one(&app.db)
        .await?;
    let policy_jobs: i64 = db::scalar(db::Statement::AccountTasksSelectCredentialJobs)
        .fetch_one(&app.db)
        .await?;
    let reconciliation: i64 = db::scalar(db::Statement::AccountTasksSelectPlatformUsers)
        .fetch_one(&app.db)
        .await?;
    Ok(Json(
        json!({"accountPolicyJobs":policy_jobs,"credentialRevocations":pending,"registrationReconciliation":reconciliation}),
    ))
}
#[utoipa::path(post,path="/api/v1/admin/tasks/retry",responses((status=200,body=Value),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn retry_tasks(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let me = operator(&app, &headers, true).await?;
    let mut tx = db::begin(&app.db).await?;
    let policy = db::query(db::Statement::AccountRetryTasksUpdateCredentialJobs)
        .bind(db::now())
        .execute(&mut *tx)
        .await?
        .rows_affected();
    let credentials = db::query(db::Statement::AccountRetryTasksUpdateCredentialRevocations)
        .bind(db::now())
        .execute(&mut *tx)
        .await?
        .rows_affected();
    tx.commit().await?;
    JOB_NOTIFY.notify_one();
    audit_event(&app, me.user, "task.retry", me.user, "queued").await?;
    Ok(Json(json!({"queued":policy+credentials})))
}

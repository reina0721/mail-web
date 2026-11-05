//! Deployment readiness is distinct from release-level protocol regression.
use super::*;
use rand::Rng;
use subtle::ConstantTimeEq;
static CHECK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub fn routes() -> Router<Arc<App>> {
    Router::new()
        .route("/installation/readiness", get(report).post(run))
        .route("/installation/readiness/link", post(link))
        .route("/readiness/session", post(interaction))
        .route("/readiness/send", post(readiness_send))
        .route("/readiness/verify", post(readiness_verify))
        .layer(axum::extract::DefaultBodyLimit::max(16384))
}
fn fingerprint(app: &App) -> String {
    let mut services = app.services.clone();
    services.brand.clear();
    services.policy_verified = false;
    hash(&format!(
        "readiness-v1:{}:{}:{}",
        app.upstream.base,
        app.origin,
        serde_json::to_string(&services).unwrap_or_default()
    ))
}
fn current(app: &App) -> bool {
    match installation::load(&app.vault) {
        Ok(Some(saved)) => {
            let staged = App {
                db: app.db.clone(),
                upstream: Stalwart {
                    http: app.upstream.http.clone(),
                    base: saved.stalwart_url,
                },
                origin: saved.origin,
                vault: app.vault.clone(),
                services: saved.services,
            };
            fingerprint(app) == fingerprint(&staged)
        }
        Ok(None) => true,
        Err(_) => false,
    }
}
pub async fn ready(app: &App) -> Result<bool> {
    if !app.services.ready() || !current(app) || installation::initialize::active(app).await? {
        return Ok(false);
    }
    let row = db::query(db::Statement::ReadinessGet)
        .bind(fingerprint(app))
        .fetch_optional(&app.db)
        .await?;
    Ok(row.is_some_and(|r| {
        r.get::<bool, _>("automatic_ok")
            && r.get::<i64, _>("human_verified_at") > 0
            && r.get::<i64, _>("checked_at") > db::now() - 360_000
    }))
}
pub async fn view(app: &App) -> Result<Value> {
    let row = db::query(db::Statement::ReadinessGet)
        .bind(fingerprint(app))
        .fetch_optional(&app.db)
        .await?;
    let (items, checked, human) = if let Some(row) = row {
        (
            serde_json::from_str::<Value>(&row.get::<String, _>("report")).unwrap_or(json!([])),
            row.get::<i64, _>("checked_at"),
            row.get::<i64, _>("human_verified_at"),
        )
    } else {
        (json!([]), 0, 0)
    };
    let ready = ready(app).await?;
    let requested = registration::settings(app).await?["enabled"] == true;
    Ok(
        json!({"ready":ready,"requestedEnabled":requested,"effectiveEnabled":requested&&ready,"items":items,"checkedAt":checked,"humanVerifiedAt":human,"manualDeclaration":app.services.policy_verified,"releaseVersion":env!("CARGO_PKG_VERSION"),"protocolScope":"版本协议回归与本站检查分开展示；本站未执行生产停机或 SMTP/JMAP 压力测试"}),
    )
}
#[utoipa::path(get,path="/api/v1/installation/readiness",responses((status=200,body=Value)))]
pub(crate) async fn report(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    installation::authorize(&app, &headers, false).await?;
    Ok(Json(view(&app).await?))
}
#[utoipa::path(post,path="/api/v1/installation/readiness",responses((status=200,body=Value)))]
pub(crate) async fn run(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    installation::authorize(&app, &headers, true).await?;
    check(&app).await?;
    Ok(Json(view(&app).await?))
}
async fn permissions(app: &App, key: &str, required: &[&str]) -> Result<()> {
    let response = app
        .upstream
        .http
        .get(format!("{}/api/account", app.upstream.base))
        .bearer_auth(key)
        .send()
        .await
        .map_err(|_| Error(StatusCode::BAD_GATEWAY, "upstream_unavailable"))?;
    if !response.status().is_success() {
        return Err(Error(StatusCode::BAD_GATEWAY, "credential_rejected"));
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| internal("upstream_response_invalid"))?;
    if required.iter().any(|p| {
        !value["permissions"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|v| v == p)
    }) {
        return Err(Error(StatusCode::FORBIDDEN, "required_permissions_missing"));
    }
    Ok(())
}
fn scope_matches(actual: &str, expected: &str) -> bool {
    fn names(expression: &str) -> Option<Vec<String>> {
        let list = expression
            .trim()
            .strip_prefix("!is_empty(authenticated_as) && contains(")?
            .strip_suffix(", to_lowercase(authenticated_as))")?;
        let mut names: Vec<String> = serde_json::from_str(list).ok()?;
        names.sort();
        names.dedup();
        Some(names)
    }
    if actual == expected {
        return true;
    }
    matches!((names(actual),names(expected)),(Some(a),Some(b)) if a==b)
}
fn hook_scope_matches(enable: &Value, expected: &str) -> bool {
    enable.as_object().is_some_and(|fields| {
        fields.iter().all(|(key, value)| {
            key == "else"
                || (key == "match"
                    && (value.as_array().is_some_and(Vec::is_empty)
                        || value.as_object().is_some_and(serde_json::Map::is_empty)))
        })
    }) && scope_matches(enable["else"].as_str().unwrap_or_default(), expected)
}
pub async fn check(app: &App) -> Result<()> {
    let _guard = CHECK.lock().await;
    let revision = fingerprint(app);
    let s = &app.services;
    let mut items = Vec::new();
    macro_rules! item {($key:expr,$label:expr,$result:expr)=>{{let result:Result<()>=$result;items.push(json!({"id":$key,"label":$label,"status":if result.is_ok(){"passed"}else{"failed"},"reason":result.err().map(|e|e.1),"repairUrl":"/setup/"}));}};}
    item!(
        "configuration",
        "运行凭据和网站来源",
        if s.ready() && current(app) && !installation::initialize::active(app).await? {
            Ok(())
        } else {
            Err(Error(
                StatusCode::BAD_REQUEST,
                "configuration_fields_missing",
            ))
        }
    );
    item!(
        "directory",
        "目录服务与账号管理权限",
        permissions(
            app,
            &s.provisioning_key,
            &[
                "sysDomainGet",
                "sysAccountGet",
                "sysAccountQuery",
                "sysAccountCreate",
                "sysAccountUpdate",
                "sysMtaHookGet",
                "sysMtaHookUpdate",
                "sysActionCreate",
                "actionReloadSettings"
            ]
        )
        .await
    );
    item!(
        "domain",
        "已配置的邮箱域名",
        async {
            let value = app
                .upstream
                .call(
                    &s.provisioning_key,
                    "x:Domain/get",
                    json!({"ids":[s.domain_id],"properties":["id","name"]}),
                )
                .await?;
            if value["list"][0]["name"] != s.domain {
                return Err(Error(StatusCode::BAD_REQUEST, "domain_mismatch"));
            }
            Ok(())
        }
        .await
    );
    item!(
        "sender",
        "发件权限与真实发件身份",
        async {
            permissions(
                app,
                &s.notification_key,
                &[
                    "emailSend",
                    "jmapMailboxGet",
                    "jmapEmailCreate",
                    "jmapIdentityGet",
                    "jmapEmailSubmissionCreate",
                ],
            )
            .await?;
            let mailboxes = app
                .upstream
                .call(
                    &s.notification_key,
                    "Mailbox/get",
                    json!({"accountId":s.notification_account,"properties":["id"]}),
                )
                .await?;
            if !mailboxes["list"]
                .as_array()
                .is_some_and(|list| !list.is_empty())
            {
                return Err(Error(StatusCode::BAD_REQUEST, "sender_mailbox_missing"));
            }
            let value = app
                .upstream
                .call(
                    &s.notification_key,
                    "Identity/get",
                    json!({"accountId":s.notification_account}),
                )
                .await?;
            if !value["list"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|i| i["email"] == s.notification_email)
            {
                return Err(Error(StatusCode::BAD_REQUEST, "sender_identity_missing"));
            }
            Ok(())
        }
        .await
    );
    item!("hook","专用 Hook 配置与账号作用范围",async{let value=app.upstream.call(&s.provisioning_key,"x:MtaHook/get",json!({"ids":[s.hook_id],"properties":["id","url","enable","stages","tempFailOnError","httpAuth"]})).await?;let h=&value["list"][0];if h["url"]!=format!("{}/internal/mta-hook",app.origin)||h["stages"]["data"]!=true||h["tempFailOnError"]!=true||h["httpAuth"]["@type"]!="Bearer"||!hook_scope_matches(&h["enable"],&policy::scope_expression(app).await?){return Err(Error(StatusCode::BAD_REQUEST,"hook_configuration_mismatch"));}Ok(())}.await);
    item!(
        "callback",
        "网站回调认证（不代表协议实测）",
        async {
            let response = app
                .upstream
                .http
                .post(format!("{}/internal/mta-hook", app.origin))
                .bearer_auth(&s.hook_secret)
                .json(&json!({"context":{"stage":"data"}}))
                .send()
                .await
                .map_err(|_| Error(StatusCode::BAD_GATEWAY, "callback_unreachable"))?;
            if !response.status().is_success()
                || response
                    .json::<Value>()
                    .await
                    .map_err(|_| internal("callback_invalid"))?["action"]
                    != "accept"
            {
                return Err(Error(
                    StatusCode::BAD_GATEWAY,
                    "callback_authentication_failed",
                ));
            }
            Ok(())
        }
        .await
    );
    item!(
        "turnstile",
        "Turnstile 配置（真实验证在下一步）",
        if !s.turnstile_site_key.is_empty() && !s.turnstile_secret.is_empty() {
            Ok(())
        } else {
            Err(Error(StatusCode::BAD_REQUEST, "turnstile_missing"))
        }
    );
    let ok = items.iter().all(|i| i["status"] == "passed");
    db::query(db::Statement::ReadinessWrite)
        .bind(revision)
        .bind(serde_json::to_string(&items).map_err(|_| internal("readiness_encode"))?)
        .bind(db::now())
        .bind(ok)
        .execute(&app.db)
        .await?;
    Ok(())
}
pub async fn worker(app: Arc<App>) {
    loop {
        let _ = check(&app).await;
        tokio::time::sleep(std::time::Duration::from_secs(300)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scope_checks_accept_equivalent_sets_but_reject_extra_accounts_and_rules() {
        let expected = "!is_empty(authenticated_as) && contains([\"a\",\"a@example.com\"], to_lowercase(authenticated_as))";
        assert!(scope_matches(
            "!is_empty(authenticated_as) && contains([\"a@example.com\", \"a\"], to_lowercase(authenticated_as))",
            expected
        ));
        assert!(hook_scope_matches(
            &json!({"else":expected,"match":{}}),
            expected
        ));
        assert!(!hook_scope_matches(
            &json!({"else":expected,"match":{"0":{"if":"true","then":"true"}}}),
            expected
        ));
        assert!(hook_scope_matches(
            &json!({"else":expected,"match":[]}),
            expected
        ));
        assert!(!hook_scope_matches(
            &json!({"else":expected,"match":[{"if":"true","then":"true"}]}),
            expected
        ));
        assert!(!hook_scope_matches(
            &json!({"else":expected,"unknown":"true"}),
            expected
        ));
        for invalid in [
            "true",
            "false",
            "!is_empty(authenticated_as) && contains([\"a\",\"a@example.com\",\"other\"], to_lowercase(authenticated_as))",
            "true || !is_empty(authenticated_as) && contains([\"a\",\"a@example.com\"], to_lowercase(authenticated_as))",
        ] {
            assert!(!scope_matches(invalid, expected));
        }
    }
    #[tokio::test]
    async fn readiness_is_config_bound_and_manual_declaration_does_not_open_registration() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let pool = db::connect(&root.join("test.sqlite")).await.unwrap();
        let services = config::Services {
            brand: "Mail".into(),
            domain: "example.com".into(),
            domain_id: "d".into(),
            provisioning_key: "directory".into(),
            notification_key: "sender".into(),
            notification_account: "s".into(),
            notification_email: "sender@example.com".into(),
            hook_id: "h".into(),
            hook_secret: "hook".into(),
            turnstile_site_key: "site".into(),
            turnstile_secret: "secret".into(),
            policy_verified: true,
        };
        let app = App {
            db: pool,
            upstream: Stalwart {
                http: reqwest::Client::new(),
                base: "https://mail.example.com".into(),
            },
            vault: Vault::new(&[3; 32]).unwrap(),
            origin: "https://webmail.example.com".into(),
            services,
        };
        assert!(!ready(&app).await.unwrap());
        let revision = fingerprint(&app);
        db::query(db::Statement::ReadinessWrite)
            .bind(&revision)
            .bind("[]")
            .bind(db::now())
            .bind(true)
            .execute(&app.db)
            .await
            .unwrap();
        assert!(!ready(&app).await.unwrap());
        db::query(db::Statement::ReadinessHuman)
            .bind(db::now())
            .bind(&revision)
            .execute(&app.db)
            .await
            .unwrap();
        assert!(ready(&app).await.unwrap());
        let mut changed = app.clone();
        changed.services.brand = "Other brand".into();
        changed.services.policy_verified = false;
        assert_eq!(revision, fingerprint(&changed));
        assert!(ready(&changed).await.unwrap());
        changed.services.turnstile_secret = "rotated".into();
        assert!(!ready(&changed).await.unwrap());
        db::query(db::Statement::ReadinessWrite)
            .bind(&revision)
            .bind("[]")
            .bind(db::now())
            .bind(false)
            .execute(&app.db)
            .await
            .unwrap();
        assert!(!ready(&app).await.unwrap());
    }

    #[tokio::test]
    async fn check_codes_are_single_use_config_bound_and_attempt_limited() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let db = db::connect(&root.join("test.sqlite")).await.unwrap();
        let app = Arc::new(App {
            db,
            upstream: Stalwart {
                http: reqwest::Client::new(),
                base: "https://mail.example.com".into(),
            },
            vault: Vault::new(&[4; 32]).unwrap(),
            origin: "https://webmail.example.com".into(),
            services: config::Services {
                turnstile_secret: "private-pepper".into(),
                ..Default::default()
            },
        });
        let revision = fingerprint(&app);
        db::query(db::Statement::ReadinessWrite)
            .bind(&revision)
            .bind("[]")
            .bind(db::now())
            .bind(true)
            .execute(&app.db)
            .await
            .unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(
            "origin",
            HeaderValue::from_static("https://webmail.example.com"),
        );
        for success in [false, true] {
            let ticket = token();
            let digest = hash(&format!(
                "readiness:{ticket}:123456:{}",
                app.services.turnstile_secret
            ));
            db::query(db::Statement::ReadinessLink)
                .bind(hash(&ticket))
                .bind(&revision)
                .bind(db::now() + 600_000)
                .execute(&app.db)
                .await
                .unwrap();
            db::query(db::Statement::ReadinessClaimSend)
                .bind("receiver@example.net")
                .bind(&digest)
                .bind(db::now() + 600_000)
                .bind(hash(&ticket))
                .bind(&revision)
                .bind(db::now())
                .execute(&app.db)
                .await
                .unwrap();
            let input = |code: &str| Input {
                ticket: ticket.clone(),
                email: String::new(),
                turnstile_token: String::new(),
                code: code.into(),
            };
            assert!(
                readiness_verify(State(app.clone()), HeaderMap::new(), Json(input("123456")))
                    .await
                    .is_err()
            );
            let mut changed = (*app).clone();
            changed.services.turnstile_secret = "changed".into();
            assert!(session(&changed, &input("123456")).await.is_err());
            if !success {
                for _ in 0..5 {
                    assert!(
                        readiness_verify(
                            State(app.clone()),
                            headers.clone(),
                            Json(input("999999"))
                        )
                        .await
                        .is_err()
                    );
                }
                assert!(
                    readiness_verify(State(app.clone()), headers.clone(), Json(input("123456")))
                        .await
                        .is_err()
                );
            } else {
                let result =
                    readiness_verify(State(app.clone()), headers.clone(), Json(input("123456")))
                        .await
                        .unwrap();
                assert_eq!(result.0["registrationOpened"], false);
                assert!(result.0.get("verificationToken").is_none());
                assert!(
                    readiness_verify(State(app.clone()), headers.clone(), Json(input("123456")))
                        .await
                        .is_err()
                );
            }
        }
    }
}
#[utoipa::path(post,path="/api/v1/installation/readiness/link",responses((status=200,body=Value)))]
pub(crate) async fn link(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    installation::authorize(&app, &headers, true).await?;
    check(&app).await?;
    let row = db::query(db::Statement::ReadinessGet)
        .bind(fingerprint(&app))
        .fetch_one(&app.db)
        .await?;
    if !row.get::<bool, _>("automatic_ok") {
        return Err(Error(
            StatusCode::CONFLICT,
            "readiness_automatic_checks_failed",
        ));
    }
    let ticket = token();
    db::query(db::Statement::ReadinessLink)
        .bind(hash(&ticket))
        .bind(fingerprint(&app))
        .bind(db::now() + 600_000)
        .execute(&app.db)
        .await?;
    Ok(Json(
        json!({"url":format!("{}/setup/check/#check={ticket}",app.origin),"expiresInSeconds":600}),
    ))
}
#[derive(Deserialize)]
pub(crate) struct Input {
    ticket: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    turnstile_token: String,
    #[serde(default)]
    code: String,
}
async fn session(app: &App, input: &Input) -> Result<sqlx::sqlite::SqliteRow> {
    if input.ticket.len() != 64 || !input.ticket.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(Error(StatusCode::UNAUTHORIZED, "readiness_link_expired"));
    }
    if !current(app) {
        return Err(Error(
            StatusCode::CONFLICT,
            "readiness_configuration_changed",
        ));
    }
    db::query(db::Statement::ReadinessInteraction)
        .bind(hash(&input.ticket))
        .bind(fingerprint(app))
        .bind(db::now())
        .fetch_optional(&app.db)
        .await?
        .ok_or(Error(StatusCode::UNAUTHORIZED, "readiness_link_expired"))
}
#[utoipa::path(post,path="/api/v1/readiness/session",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn interaction(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Input>,
) -> Result<Json<Value>> {
    same_origin(&app, &headers)?;
    let session = session(&app, &input).await?;
    Ok(Json(
        json!({"siteKey":app.services.turnstile_site_key,"mailSent":session.get::<bool,_>("captcha_verified")}),
    ))
}
#[utoipa::path(post,path="/api/v1/readiness/send",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn readiness_send(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Input>,
) -> Result<Json<Value>> {
    same_origin(&app, &headers)?;
    let _ = session(&app, &input).await?;
    let email = input.email.trim().to_lowercase();
    if !registration::address(&email)
        || email.len() > 254
        || email.chars().any(char::is_whitespace)
        || app.services.is_local_address(&email)
    {
        return Err(Error(StatusCode::BAD_REQUEST, "recovery_email_invalid"));
    }
    policy::rate(&app, &format!("readiness-mail:{}", hash(&email)), 1, 60_000).await?;
    policy::rate(&app, "readiness-global", 30, 3_600_000).await?;
    registration::captcha(&app, &input.turnstile_token).await?;
    let code = format!("{:06}", rand::thread_rng().gen_range(0..1_000_000));
    let digest = hash(&format!(
        "readiness:{}:{code}:{}",
        input.ticket, app.services.turnstile_secret
    ));
    let changed = db::query(db::Statement::ReadinessClaimSend)
        .bind(&email)
        .bind(&digest)
        .bind(db::now() + 600_000)
        .bind(hash(&input.ticket))
        .bind(fingerprint(&app))
        .bind(db::now())
        .execute(&app.db)
        .await?
        .rows_affected();
    if changed != 1 {
        return Err(Error(StatusCode::CONFLICT, "readiness_mail_already_sent"));
    }
    if let Err(error) = registration::notify(
        &app,
        &email,
        &format!("{} 注册功能检查", app.services.brand),
        &format!(
            "检查验证码：{code}，十分钟内有效。此邮件用于确认注册验证码能够送达，不会创建邮箱账号。"
        ),
    )
    .await
    {
        db::query(db::Statement::ReadinessSent)
            .bind(hash(&input.ticket))
            .execute(&app.db)
            .await?;
        return Err(error);
    }
    Ok(Json(json!({"sent":true})))
}
#[utoipa::path(post,path="/api/v1/readiness/verify",request_body=Value,responses((status=200,body=Value)))]
pub(crate) async fn readiness_verify(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Input>,
) -> Result<Json<Value>> {
    same_origin(&app, &headers)?;
    let row = session(&app, &input).await?;
    let revision = fingerprint(&app);
    if db::query(db::Statement::ReadinessAttempt)
        .bind(hash(&input.ticket))
        .bind(&revision)
        .bind(db::now())
        .execute(&app.db)
        .await?
        .rows_affected()
        != 1
    {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "readiness_attempts_exhausted",
        ));
    }
    let digest = hash(&format!(
        "readiness:{}:{}:{}",
        input.ticket, input.code, app.services.turnstile_secret
    ));
    let expected: Option<String> = row.get("code_hash");
    if !expected.is_some_and(|v| bool::from(v.as_bytes().ct_eq(digest.as_bytes()))) {
        return Err(Error(StatusCode::BAD_REQUEST, "code_invalid"));
    }
    let mut tx = db::begin(&app.db).await?;
    if db::query(db::Statement::ReadinessConsume)
        .bind(hash(&input.ticket))
        .bind(&revision)
        .bind(db::now())
        .bind(digest)
        .execute(&mut *tx)
        .await?
        .rows_affected()
        != 1
    {
        return Err(Error(StatusCode::BAD_REQUEST, "readiness_link_expired"));
    }
    db::query(db::Statement::ReadinessHuman)
        .bind(db::now())
        .bind(revision)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"verified":true,"registrationOpened":false})))
}

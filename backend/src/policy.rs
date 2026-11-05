use super::*;
use subtle::ConstantTimeEq;

async fn scope_lock(app: &App) -> tokio::sync::OwnedMutexGuard<()> {
    static LOCKS: std::sync::LazyLock<
        std::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    > = std::sync::LazyLock::new(Default::default);
    let mutex = LOCKS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .entry(app.service_id.clone())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone();
    mutex.lock_owned().await
}
pub async fn sync_scope(app: &App) -> Result<()> {
    if app.services.hook_id.is_empty() {
        return Err(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "submission_policy_missing",
        ));
    }
    let _guard = scope_lock(app).await;
    let expression = scope_expression(app).await?;
    let mut update = json!({});
    update[&app.services.hook_id] = json!({"enable":{"else":expression}});
    app.upstream
        .call(
            &app.services.provisioning_key,
            "x:MtaHook/set",
            json!({"update":update}),
        )
        .await?;
    app.upstream
        .call(
            &app.services.provisioning_key,
            "x:Action/set",
            json!({"create":{"reload":{"@type":"ReloadSettings"}}}),
        )
        .await?;
    Ok(())
}

pub async fn rate(app: &App, bucket: &str, maximum: i64, period: i64) -> Result<()> {
    let now = db::now();
    let row = db::query(db::Statement::PolicyRateInsertRequestLimits)
        .bind(bucket)
        .bind(now)
        .bind(now - period)
        .bind(now - period)
        .fetch_one(&app.db)
        .await?;
    if row.get::<i64, _>("count") > maximum {
        return Err(Error(StatusCode::TOO_MANY_REQUESTS, "rate_limited"));
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct Hook {
    context: Context,
    envelope: Option<Envelope>,
}
#[derive(Deserialize)]
struct Context {
    stage: String,
    sasl: Option<Sasl>,
    queue: Option<Queue>,
}
#[derive(Deserialize)]
struct Sasl {
    login: String,
}
#[derive(Deserialize)]
struct Queue {
    id: String,
}
#[derive(Deserialize)]
struct Envelope {
    to: Vec<Address>,
}
#[derive(Deserialize)]
struct Address {
    address: String,
}

async fn reserve(app: &App, login: &str, event: &str, count: i64) -> Result<bool> {
    let mut tx = db::begin(&app.db).await?;
    let normalized = login.to_lowercase();
    let rows = db::query(db::Statement::PolicyReserveSelectPlatformUsers)
        .bind(&app.service_id)
        .bind(&normalized)
        .bind(&normalized)
        .bind(&normalized)
        .fetch_all(&mut *tx)
        .await?;
    if rows.len() != 1 {
        tx.commit().await?;
        return Ok(false);
    }
    let row = &rows[0];
    if row.get::<String, _>("status") != "active" {
        return Ok(false);
    }
    if count == 0 {
        return Ok(true);
    }
    let user: Uuid = row.get("id");
    if db::scalar::<i64>(db::Statement::PolicyReserveSelectOutboundReservations3)
        .bind(event)
        .bind(user)
        .fetch_one(&mut *tx)
        .await?
        > 0
    {
        tx.commit().await?;
        return Ok(true);
    }
    let now = db::now();
    let hourly: i64 = db::scalar(db::Statement::PolicyReserveSelectOutboundReservations)
        .bind(user)
        .bind(now - 3600000)
        .fetch_one(&mut *tx)
        .await?;
    let daily: i64 = db::scalar(db::Statement::PolicyReserveSelectOutboundReservations2)
        .bind(user)
        .bind(now - 86400000)
        .fetch_one(&mut *tx)
        .await?;
    if hourly + count > row.get::<i64, _>("hourly_recipients")
        || daily + count > row.get::<i64, _>("daily_recipients")
    {
        return Ok(false);
    }
    db::query(db::Statement::PolicyReserveInsertOutboundReservations)
        .bind(event)
        .bind(user)
        .bind(count)
        .bind(now)
        .bind(&app.service_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(true)
}
pub async fn hook(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Hook>,
) -> Result<Json<Value>> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if app.services.hook_secret.is_empty()
        || !bool::from(auth.as_bytes().ct_eq(app.services.hook_secret.as_bytes()))
    {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "hook_authentication_required",
        ));
    }
    if input.context.stage != "data" {
        return Err(Error(StatusCode::BAD_REQUEST, "data_stage_required"));
    }
    let Some(sasl) = input.context.sasl else {
        return Ok(Json(json!({"action":"accept"})));
    };
    let event = input
        .context
        .queue
        .ok_or(Error(StatusCode::BAD_REQUEST, "queue_id_required"))?
        .id;
    let recipients = input
        .envelope
        .ok_or(Error(StatusCode::BAD_REQUEST, "envelope_required"))?
        .to;
    // A connection can host several domains. The sender's immutable mapping,
    // rather than the first bound domain, defines its internal recipients.
    let principal = sasl.login.to_lowercase();
    let senders = db::query(db::Statement::PolicyReserveSelectPlatformUsers)
        .bind(&app.service_id)
        .bind(&principal)
        .bind(&principal)
        .bind(&principal)
        .fetch_all(&app.db)
        .await?;
    if senders.len() != 1 {
        return Err(Error(StatusCode::CONFLICT, "hook_identity_unresolved"));
    }
    let app = connections::for_domain(&app, &senders[0].get::<String, _>("domain_id")).await?;
    let count = recipients
        .iter()
        .map(|r| r.address.to_lowercase())
        .collect::<std::collections::HashSet<_>>()
        .iter()
        .filter(|r| !app.services.is_local_address(r))
        .count() as i64;
    if reserve(&app, &sasl.login, &event, count).await? {
        Ok(Json(json!({"action":"accept"})))
    } else {
        Ok(Json(
            json!({"action":"reject","response":{"status":451,"enhancedStatus":"4.7.0","message":"Account sending limit reached; retry later"}}),
        ))
    }
}

pub async fn scope_expression(app: &App) -> Result<String> {
    let rows = db::query(db::Statement::PolicySyncScopeSelectPlatformUsers)
        .bind(&app.service_id)
        .fetch_all(&app.db)
        .await?;
    let mut names = Vec::<String>::new();
    let mut principals = HashMap::<String, String>::new();
    for row in rows {
        let email: String = row.get("email");
        let local = email.split('@').next().unwrap_or("").to_string();
        let account: String = row.get("stalwart_id");
        for candidate in [&local, &email, &account] {
            if principals
                .get(candidate)
                .is_some_and(|owner| owner != &email)
            {
                return Err(Error(StatusCode::CONFLICT, "hook_identity_ambiguous"));
            }
            principals.insert(candidate.clone(), email.clone());
        }
        names.push(local);
        names.push(email);
        names.push(account);
    }
    let expression = if names.is_empty() {
        "false".into()
    } else {
        format!(
            "!is_empty(authenticated_as) && contains({}, to_lowercase(authenticated_as))",
            serde_json::to_string(&names).map_err(|_| internal("scope"))?
        )
    };

    Ok(expression)
}

pub async fn service_hook(
    State(app): State<Arc<App>>,
    Path(service): Path<String>,
    headers: HeaderMap,
    Json(input): Json<Hook>,
) -> Result<Json<Value>> {
    let domain: String = db::scalar(db::Statement::ConnectionServiceDomain)
        .bind(service)
        .fetch_optional(&app.db)
        .await?
        .ok_or(Error(
            StatusCode::UNAUTHORIZED,
            "hook_authentication_failed",
        ))?;
    let app = connections::for_domain(&app, &domain).await?;
    hook(State(app), headers, Json(input)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn hook_counts_external_recipients_against_the_actual_senders_domain() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let db = db::connect(&root.join("mail.sqlite")).await.unwrap();
        sqlx::query(
            "INSERT INTO mail_domains VALUES ('other','default','other.example','remote-other')",
        )
        .execute(&db)
        .await
        .unwrap();
        let user = Uuid::new_v4();
        sqlx::query("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status,domain_id) VALUES (?,'sender@other.example','recover@example.net','same-id','active','other')").bind(user).execute(&db).await.unwrap();
        let app = Arc::new(App {
            root: None,
            revision: 0,
            service_id: "default".into(),
            domain_id: "default".into(),
            db: db.clone(),
            vault: Vault::new(&[1; 32]).unwrap(),
            origin: "https://webmail.example".into(),
            upstream: Stalwart {
                http: reqwest::Client::new(),
                base: "https://upstream.example".into(),
            },
            services: config::Services {
                domain: "primary.example".into(),
                hook_secret: "isolated-hook-secret".into(),
                ..Default::default()
            },
        });
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer isolated-hook-secret"),
        );
        for (event, recipient) in [
            ("internal", "recipient@other.example"),
            ("external", "recipient@primary.example"),
        ] {
            let payload:Hook=serde_json::from_value(json!({"context":{"stage":"data","sasl":{"login":"same-id"},"queue":{"id":event}},"envelope":{"to":[{"address":recipient}]}})).unwrap();
            assert_eq!(
                hook(State(app.clone()), headers.clone(), Json(payload))
                    .await
                    .unwrap()
                    .0["action"],
                "accept"
            );
        }
        let count: i64 = sqlx::query_scalar(
            "SELECT sum(recipient_count) FROM outbound_reservations WHERE user_id=?",
        )
        .bind(user)
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(count, 1);
        db.close().await;
        drop(app);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn atomic_limits_idempotency_and_persistence() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let pool = db::connect(&root.join("mail.sqlite")).await.unwrap();
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status) VALUES (?,'u@mail.example','r@example.net','test','active')").bind(id).execute(&pool).await.unwrap();
        let app = Arc::new(App {
            root: None,
            revision: 0,
            service_id: "default".into(),
            domain_id: "default".into(),
            db: pool,
            upstream: Stalwart {
                http: reqwest::Client::new(),
                base: "https://localhost".into(),
            },
            vault: Vault::new(&[1; 32]).unwrap(),
            origin: "https://localhost".into(),
            services: crate::config::Services {
                domain: "mail.example".into(),
                ..crate::config::Services::default()
            },
        });
        let mut tasks = tokio::task::JoinSet::new();
        for i in 0..20 {
            let app = app.clone();
            tasks.spawn(async move {
                reserve(&app, "u@mail.example", &format!("event-{i}"), 1)
                    .await
                    .unwrap()
            });
        }
        let mut accepted = 0;
        while let Some(r) = tasks.join_next().await {
            accepted += i32::from(r.unwrap());
        }
        assert_eq!(accepted, 10);
        let n: i64 = sqlx::query_scalar("SELECT sum(recipient_count) FROM outbound_reservations")
            .fetch_one(&app.db)
            .await
            .unwrap();
        assert_eq!(n, 10);
        assert!(rate(&app, "login-test", 1, 60000).await.is_ok());
        assert_eq!(
            rate(&app, "login-test", 1, 60000).await.unwrap_err().0,
            StatusCode::TOO_MANY_REQUESTS
        );
        assert!(!reserve(&app, "u@mail.example", "extra", 1).await.unwrap());
        assert!(
            !reserve(&app, "unmanaged@mail.example", "unmanaged", 1)
                .await
                .unwrap()
        );
        assert!(!reserve(&app, "test", "cross-protocol", 1).await.unwrap());
        app.db.close().await;
        let restored = db::connect(&root.join("mail.sqlite")).await.unwrap();
        let restarted = App {
            root: None,
            revision: 0,
            service_id: "default".into(),
            domain_id: "default".into(),
            db: restored,
            ..(*app).clone()
        };
        assert_eq!(
            rate(&restarted, "login-test", 1, 60000)
                .await
                .unwrap_err()
                .0,
            StatusCode::TOO_MANY_REQUESTS
        );
        assert!(!reserve(&restarted, "u", "after-restart", 1).await.unwrap());
        let event: String =
            sqlx::query_scalar("SELECT event_id FROM outbound_reservations LIMIT 1")
                .fetch_one(&restarted.db)
                .await
                .unwrap();
        assert!(reserve(&restarted, "test", &event, 1).await.unwrap());
        restarted.db.close().await;
        drop(app);
        std::fs::remove_dir_all(root).unwrap();
    }
}

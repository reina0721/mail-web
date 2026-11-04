use super::*;
use subtle::ConstantTimeEq;

static SCOPE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub async fn sync_scope(app: &App) -> Result<()> {
    if app.services.hook_id.is_empty() {
        return Err(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "submission_policy_missing",
        ));
    }
    let _guard = SCOPE_LOCK.lock().await;
    let rows =
        sqlx::query("SELECT email,stalwart_id FROM platform_users WHERE stalwart_id IS NOT NULL")
            .fetch_all(&app.db)
            .await?;
    let mut names = Vec::<String>::new();
    for row in rows {
        let email: String = row.get("email");
        names.push(email.split('@').next().unwrap_or("").to_string());
        names.push(email);
        names.push(row.get("stalwart_id"));
    }
    let expression = if names.is_empty() {
        "false".into()
    } else {
        format!(
            "!is_empty(authenticated_as) && contains({}, to_lowercase(authenticated_as))",
            serde_json::to_string(&names).map_err(|_| internal("scope"))?
        )
    };
    let mut update = json!({});
    update[&app.services.hook_id] = json!({"enable":{"else":expression}});
    app.upstream
        .call(
            &app.services.provisioning_key,
            "x:MtaHook/set",
            json!({"update":update}),
        )
        .await?;
    Ok(())
}

pub async fn rate(app: &App, bucket: &str, maximum: i64, period: i64) -> Result<()> {
    let now = db::now();
    let row=sqlx::query("INSERT INTO request_limits(bucket,window_start,count) VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN window_start<=? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END RETURNING count")
        .bind(bucket).bind(now).bind(now-period).bind(now-period).fetch_one(&app.db).await?;
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
    let mut tx = app.db.begin_with("BEGIN IMMEDIATE").await?;
    let normalized = login.to_lowercase();
    let row=sqlx::query("SELECT id,status,hourly_recipients,daily_recipients FROM platform_users WHERE email=? OR stalwart_id=? OR email=?")
        .bind(&normalized).bind(&normalized).bind(format!("{normalized}@iqwq.com")).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        tx.commit().await?;
        return Ok(false);
    };
    if row.get::<String, _>("status") != "active" {
        return Ok(false);
    }
    let user: Uuid = row.get("id");
    if sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM outbound_reservations WHERE event_id=? AND user_id=?",
    )
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
    let hourly:i64=sqlx::query_scalar("SELECT COALESCE(sum(recipient_count),0) FROM outbound_reservations WHERE user_id=? AND created_at>?").bind(user).bind(now-3600000).fetch_one(&mut *tx).await?;
    let daily:i64=sqlx::query_scalar("SELECT COALESCE(sum(recipient_count),0) FROM outbound_reservations WHERE user_id=? AND created_at>?").bind(user).bind(now-86400000).fetch_one(&mut *tx).await?;
    if hourly + count > row.get::<i64, _>("hourly_recipients")
        || daily + count > row.get::<i64, _>("daily_recipients")
    {
        return Ok(false);
    }
    sqlx::query("INSERT INTO outbound_reservations(event_id,user_id,recipient_count,created_at) VALUES (?,?,?,?)").bind(event).bind(user).bind(count).bind(now).execute(&mut *tx).await?;
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
    let count = recipients
        .iter()
        .map(|r| r.address.to_lowercase())
        .collect::<std::collections::HashSet<_>>()
        .iter()
        .filter(|r| !r.ends_with("@iqwq.com"))
        .count() as i64;
    if count == 0 {
        return Ok(Json(json!({"action":"accept"})));
    }
    if reserve(&app, &sasl.login, &event, count).await? {
        Ok(Json(json!({"action":"accept"})))
    } else {
        Ok(Json(
            json!({"action":"reject","response":{"status":451,"enhancedStatus":"4.7.0","message":"Account sending limit reached; retry later"}}),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn atomic_limits_idempotency_and_persistence() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let pool = db::connect(&root.join("mail.sqlite")).await.unwrap();
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status) VALUES (?,'u@iqwq.com','r@example.net','test','active')").bind(id).execute(&pool).await.unwrap();
        let app = Arc::new(App {
            db: pool,
            upstream: Stalwart {
                http: reqwest::Client::new(),
                base: "https://localhost".into(),
            },
            vault: Vault::new(&[1; 32]).unwrap(),
            origin: "https://localhost".into(),
            services: crate::config::Services::default(),
        });
        let mut tasks = tokio::task::JoinSet::new();
        for i in 0..20 {
            let app = app.clone();
            tasks.spawn(async move {
                reserve(&app, "u@iqwq.com", &format!("event-{i}"), 1)
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
        assert!(!reserve(&app, "u@iqwq.com", "extra", 1).await.unwrap());
        assert!(
            !reserve(&app, "unmanaged@iqwq.com", "unmanaged", 1)
                .await
                .unwrap()
        );
        assert!(!reserve(&app, "test", "cross-protocol", 1).await.unwrap());
        app.db.close().await;
        let restored = db::connect(&root.join("mail.sqlite")).await.unwrap();
        let restarted = App {
            db: restored,
            ..(*app).clone()
        };
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

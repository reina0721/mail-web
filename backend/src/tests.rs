use super::*;
use axum::{body::Body, http::Request};
use tower::ServiceExt;

#[tokio::test]
async fn session_isolation_csrf_revocation_and_operator_boundary() {
    let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
    let pool = db::connect(&root.join("test.sqlite")).await.unwrap();
    let vault = Vault::new(&[9; 32]).unwrap();
    for (name, sid) in [("alice", "session-a"), ("bob", "session-b")] {
        let user = Uuid::new_v4();
        sqlx::query("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status) VALUES (?,?,?,?,'active')").bind(user).bind(format!("{name}@iqwq.com")).bind(format!("{name}@example.net")).bind(name).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sessions(id_hash,user_id,csrf_hash,upstream_key,upstream_key_id,expires_at) VALUES (?,?,?,?,?,?)").bind(hash(sid)).bind(user).bind(hash("csrf")).bind(vault.seal(name.as_bytes()).unwrap()).bind(name).bind(db::now()+3600000).execute(&pool).await.unwrap();
    }
    let app = Arc::new(App {
        db: pool,
        upstream: Stalwart {
            http: reqwest::Client::new(),
            base: "https://unused.invalid".into(),
        },
        vault,
        origin: "https://mail.example.com".into(),
        services: config::Services::default(),
    });
    let routes = Router::new()
        .merge(account::routes())
        .route("/auth/session", get(session))
        .with_state(app.clone());
    let request = |method: &str, path: &str, origin: &str, csrf: &str| {
        Request::builder()
            .method(method)
            .uri(path)
            .header("cookie", "__Host-mail_session=session-a")
            .header("origin", origin)
            .header("x-csrf-token", csrf)
            .body(Body::empty())
            .unwrap()
    };
    assert_eq!(
        routes
            .clone()
            .oneshot(request(
                "GET",
                "/admin/users",
                "https://mail.example.com",
                "csrf"
            ))
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        routes
            .clone()
            .oneshot(request(
                "POST",
                "/auth/sessions/revoke-others",
                "https://evil.example",
                "csrf"
            ))
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        routes
            .clone()
            .oneshot(request(
                "POST",
                "/auth/sessions/revoke-others",
                "https://mail.example.com",
                "wrong"
            ))
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        routes
            .clone()
            .oneshot(request(
                "DELETE",
                &format!("/auth/sessions/{}", hash("session-b")),
                "https://mail.example.com",
                "csrf"
            ))
            .await
            .unwrap()
            .status(),
        204
    );
    let revoked: Option<i64> =
        sqlx::query_scalar("SELECT revoked_at FROM sessions WHERE id_hash=?")
            .bind(hash("session-b"))
            .fetch_one(&app.db)
            .await
            .unwrap();
    assert!(revoked.is_none(), "Alice must not revoke Bob's session");
    let before_poll = db::now() - 1000;
    sqlx::query("UPDATE sessions SET last_seen=? WHERE id_hash=?")
        .bind(before_poll)
        .bind(hash("session-a"))
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(
        routes
            .clone()
            .oneshot(request(
                "GET",
                "/auth/session",
                "https://mail.example.com",
                "csrf"
            ))
            .await
            .unwrap()
            .status(),
        200
    );
    let after_poll: i64 = sqlx::query_scalar("SELECT last_seen FROM sessions WHERE id_hash=?")
        .bind(hash("session-a"))
        .fetch_one(&app.db)
        .await
        .unwrap();
    assert_eq!(
        before_poll, after_poll,
        "Passive session probes must not extend idle expiry"
    );
    sqlx::query("UPDATE sessions SET last_seen=? WHERE id_hash=?")
        .bind(db::now() - 1800001)
        .bind(hash("session-a"))
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(
        routes
            .oneshot(request(
                "GET",
                "/auth/session",
                "https://mail.example.com",
                "csrf"
            ))
            .await
            .unwrap()
            .status(),
        401
    );
    app.db.close().await;
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn hostile_html_has_no_active_or_remote_content() {
    let cleaned = safe_html(
        "<script>alert(1)</script><img src='https://track.example/a'><iframe src='https://evil.example'></iframe><a href='javascript:alert(1)' onclick='evil()'>open</a><form action='https://evil.example'>form</form><p>hello</p>",
    );
    for forbidden in [
        "<script",
        "<img",
        "<iframe",
        "javascript:",
        "onclick",
        "<form",
    ] {
        assert!(!cleaned.contains(forbidden), "{cleaned}");
    }
    assert!(cleaned.contains("hello"));
}

#[test]
fn contract_covers_every_business_group() {
    use utoipa::OpenApi;
    let document = serde_json::to_value(ApiDoc::openapi()).unwrap();
    for path in [
        "/auth/login",
        "/auth/register",
        "/auth/recovery",
        "/mailboxes",
        "/messages",
        "/drafts",
        "/submissions",
        "/attachments",
        "/events",
        "/account",
        "/admin/users",
        "/admin/registration",
    ] {
        assert!(
            document["paths"][format!("/api/v1{path}")].is_object(),
            "missing {path}"
        );
    }
}

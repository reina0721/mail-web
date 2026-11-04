use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use std::{path::Path, time::Duration};

pub async fn connect(path: &Path) -> Result<SqlitePool, Box<dyn std::error::Error>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub async fn snapshot(pool: &SqlitePool, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if path.exists() {
        return Err("backup destination already exists".into());
    }
    sqlx::query("VACUUM INTO ?")
        .bind(path.to_str().ok_or("invalid backup path")?)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn persistence_foreign_keys_and_snapshot() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let pool = connect(&root.join("db.sqlite")).await.unwrap();
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(foreign_keys, 1);
        assert!(
            sqlx::query("INSERT INTO credential_revocations(session_hash) VALUES ('missing')")
                .execute(&pool)
                .await
                .is_err()
        );
        snapshot(&pool, &root.join("backup.sqlite")).await.unwrap();
        assert!(snapshot(&pool, &root.join("backup.sqlite")).await.is_err());
        pool.close().await;
        let restored = connect(&root.join("backup.sqlite")).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM platform_settings")
            .fetch_one(&restored)
            .await
            .unwrap();
        assert_eq!(count, 1);
        restored.close().await;
        std::fs::remove_dir_all(root).unwrap();
    }
}

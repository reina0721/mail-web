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
    sqlx::migrate!("./migrations/sqlite").run(&pool).await?;
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

// Production SQL is kept with the SQLite engine.
pub type Pool = SqlitePool;
#[derive(Clone, Copy)]
pub enum Statement {
    MailSendDraftSubmissionCount,
    MainMessageSubmission,
    AccountInitializePolicyVersion,
    AccountInitializePolicyUsers,
    AccountInitializePolicyJob,
    AccountInitializePolicyCommit,
    MainRevokeUserUpdateSessions,
    MainRevokeUserInsertCredentialRevocations,
    MainIdentifySelectSessions,
    MainIdentifyUpdateSessions,
    MainLoginInsertSessions,
    MainLogoutUpdateSessions,
    MainMessageInsertUploadOwnership,
    MainHealthSelectValue,
    MainRevocationsUpdateCredentialRevocations,
    MainRevocationsSelectSessions,
    MainRevocationsUpdateCredentialRevocations2,
    MainRevocationsInsertCredentialRevocations,
    MainRevocationsUpdateSessions,
    MainMainInsertCredentialRevocations,
    MainMainUpdateSessions,
    AccountProfileSelectPlatformUsers,
    AccountUpdateProfileUpdatePlatformUsers,
    AccountSessionsSelectSessions,
    AccountRevokeSessionUpdateSessions,
    AccountRevokeSessionInsertCredentialRevocations,
    AccountRevokeOthersUpdateSessions,
    AccountRevokeOthersInsertCredentialRevocations,
    AccountUsersSelectPlatformUsers,
    AccountUpdateUserUpdatePlatformUsers,
    AccountUpdateUserInsertCredentialJobs,
    AccountReconcileJobUpdateCredentialJobs,
    AccountReconcileJobSelectSessions,
    AccountReconcileJobDeleteCredentialRevocations,
    AccountReconcileJobSelectCredentialJobs,
    AccountReconcileJobUpdatePlatformUsers,
    AccountReconcileJobDeleteCredentialJobs,
    AccountReconcileJobUpdateCredentialJobs2,
    AccountPutSettingsUpdatePlatformSettings,
    AccountTasksSelectCredentialRevocations,
    AccountTasksSelectCredentialJobs,
    RegistrationSettingsSelectPlatformSettings,
    RegistrationChallengeInsertVerificationChallenges,
    RegistrationVerifyUpdateVerificationChallenges,
    RegistrationVerifyUpdateVerificationChallenges2,
    RegistrationAvailabilitySelectPlatformUsers,
    RegistrationRegisterSelectVerificationChallenges,
    RegistrationRegisterSelectPlatformUsers,
    RegistrationRegisterSelectPlatformUsers2,
    RegistrationRegisterInsertPlatformUsers,
    RegistrationRegisterUpdatePlatformUsers,
    RegistrationRegisterDeletePlatformUsers,
    RegistrationRegisterUpdatePlatformUsers2,
    RegistrationRegisterUpdatePlatformUsers3,
    RegistrationRegisterUpdateVerificationChallenges,
    RegistrationRecoverUpdateVerificationChallenges,
    PolicySyncScopeSelectPlatformUsers,
    PolicyRateInsertRequestLimits,
    PolicyReserveSelectPlatformUsers,
    PolicyReserveSelectOutboundReservations,
    PolicyReserveSelectOutboundReservations2,
    PolicyReserveInsertOutboundReservations,
    MailDraftSelectUploadOwnership,
    MailSendInsertOperations,
    MailSendSelectOperations,
    MailSendUpdateOperations,
    MailSendUpdateOperations2,
    MailSendUpdateOperations3,
    MailSendUpdateOperations4,
    MailSubmissionStatusUpdateOperations,
    MailUploadInsertUploadOwnership,
    MailEventsSelectSessions,
    BootstrapOperatorSelectPlatformUsers,
    BootstrapOperatorInsertPlatformUsers,
    BootstrapOperatorUpdatePlatformUsers,
    BootstrapOperatorUpdatePlatformUsers2,
    MainLoginSelectPlatformUsers,
    MainLogoutInsertCredentialRevocations,
    MainRevocationsDeleteCredentialRevocations,
    AccountAuditEventInsertAuditEvents,
    AccountUpdateUserSelectPlatformUsers,
    AccountAuditSelectAuditEvents,
    AccountTasksSelectPlatformUsers,
    AccountRetryTasksUpdateCredentialJobs,
    AccountRetryTasksUpdateCredentialRevocations,
    RegistrationRecoverSelectPlatformUsers,
    PolicyReserveSelectOutboundReservations3,
    MailSubmissionStatusSelectOperations,
}
impl Statement {
    fn sql(self) -> &'static str {
        match self {
            Self::MailSendDraftSubmissionCount => {
                "SELECT count(*) FROM operations WHERE user_id=? AND kind='send' AND status IN ('pending','unknown','succeeded') AND json_extract(result,'$.emailId')=?"
            }
            Self::MainMessageSubmission => {
                "SELECT id,status FROM operations WHERE user_id=? AND kind='send' AND status IN ('pending','unknown','succeeded') AND json_extract(result,'$.emailId')=? ORDER BY created_at DESC LIMIT 1"
            }
            Self::AccountInitializePolicyVersion => {
                "SELECT value FROM platform_settings WHERE key='mail-user-permissions-v1'"
            }
            Self::AccountInitializePolicyUsers => {
                "SELECT id,stalwart_id,status,quota_bytes FROM platform_users WHERE stalwart_id IS NOT NULL AND status IN ('active','disabled')"
            }
            Self::AccountInitializePolicyJob => {
                "INSERT OR IGNORE INTO credential_jobs(id,kind,user_id,payload) VALUES (?,'account-policy',?,?)"
            }
            Self::AccountInitializePolicyCommit => {
                "INSERT INTO platform_settings(key,value) VALUES ('mail-user-permissions-v1','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value"
            }
            Self::MainRevokeUserUpdateSessions => {
                "UPDATE sessions SET revoked_at=? WHERE user_id=?"
            }
            Self::MainRevokeUserInsertCredentialRevocations => {
                "INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE user_id=?"
            }
            Self::MainIdentifySelectSessions => {
                "SELECT s.upstream_key,s.csrf_hash,u.id,u.email,u.stalwart_id,u.operator FROM sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.id_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>(CAST(unixepoch('subsec')*1000 AS INTEGER)) AND s.last_seen>(CAST(unixepoch('subsec')*1000 AS INTEGER)-1800000) AND u.status='active'"
            }
            Self::MainIdentifyUpdateSessions => {
                "UPDATE sessions SET last_seen=(CAST(unixepoch('subsec')*1000 AS INTEGER)) WHERE id_hash=$1"
            }
            Self::MainLoginInsertSessions => {
                "INSERT INTO sessions(id_hash,user_id,csrf_hash,upstream_key,upstream_key_id,expires_at) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS (SELECT 1 FROM platform_users WHERE id=$2 AND status='active')"
            }
            Self::MainLogoutUpdateSessions => {
                "UPDATE sessions SET revoked_at=(CAST(unixepoch('subsec')*1000 AS INTEGER)) WHERE id_hash=$1"
            }
            Self::MainMessageInsertUploadOwnership => {
                "INSERT INTO upload_ownership(user_id,blob_id,size,type,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,blob_id) DO UPDATE SET size=excluded.size,type=excluded.type"
            }
            Self::MainHealthSelectValue => "SELECT 1",
            Self::MainRevocationsUpdateCredentialRevocations => {
                "UPDATE credential_revocations SET lease_until=? WHERE session_hash=(SELECT session_hash FROM credential_revocations WHERE next_attempt<=? AND lease_until<=? LIMIT 1) RETURNING session_hash"
            }
            Self::MainRevocationsSelectSessions => {
                "SELECT s.upstream_key,s.upstream_key_id,u.stalwart_id FROM sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.id_hash=?"
            }
            Self::MainRevocationsUpdateCredentialRevocations2 => {
                "UPDATE credential_revocations SET attempts=attempts+1,lease_until=0,next_attempt=?,last_error='upstream_unavailable' WHERE session_hash=? AND lease_until=?"
            }
            Self::MainRevocationsInsertCredentialRevocations => {
                "INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE revoked_at IS NULL AND (expires_at<=? OR last_seen<=?)"
            }
            Self::MainRevocationsUpdateSessions => {
                "UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL AND (expires_at<=? OR last_seen<=?)"
            }
            Self::MainMainInsertCredentialRevocations => {
                "INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE revoked_at IS NULL"
            }
            Self::MainMainUpdateSessions => {
                "UPDATE sessions SET revoked_at=? WHERE revoked_at IS NULL"
            }
            Self::AccountProfileSelectPlatformUsers => {
                "SELECT display_name,preferences,quota_bytes FROM platform_users WHERE id=?"
            }
            Self::AccountUpdateProfileUpdatePlatformUsers => {
                "UPDATE platform_users SET display_name=?,preferences=? WHERE id=?"
            }
            Self::AccountSessionsSelectSessions => {
                "SELECT id_hash,created_at,last_seen,expires_at FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND last_seen>?"
            }
            Self::AccountRevokeSessionUpdateSessions => {
                "UPDATE sessions SET revoked_at=? WHERE id_hash=? AND user_id=?"
            }
            Self::AccountRevokeSessionInsertCredentialRevocations => {
                "INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE id_hash=? AND user_id=?"
            }
            Self::AccountRevokeOthersUpdateSessions => {
                "UPDATE sessions SET revoked_at=? WHERE user_id=? AND id_hash<>?"
            }
            Self::AccountRevokeOthersInsertCredentialRevocations => {
                "INSERT OR IGNORE INTO credential_revocations(session_hash) SELECT id_hash FROM sessions WHERE user_id=? AND id_hash<>? AND revoked_at IS NOT NULL"
            }
            Self::AccountUsersSelectPlatformUsers => {
                "SELECT id,email,status,operator,quota_bytes,hourly_recipients,daily_recipients FROM platform_users ORDER BY created_at DESC LIMIT 200"
            }
            Self::AccountUpdateUserUpdatePlatformUsers => {
                "UPDATE platform_users SET status=CASE WHEN ? THEN status ELSE 'disabled' END,quota_bytes=?,hourly_recipients=?,daily_recipients=? WHERE id=?"
            }
            Self::AccountUpdateUserInsertCredentialJobs => {
                "INSERT INTO credential_jobs(id,kind,user_id,payload) VALUES (?,'account-policy',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,attempts=0,lease_until=0,next_attempt=0"
            }
            Self::AccountReconcileJobUpdateCredentialJobs => {
                "UPDATE credential_jobs SET lease_until=? WHERE id=(SELECT id FROM credential_jobs WHERE kind='account-policy' AND lease_until<=? AND next_attempt<=? ORDER BY next_attempt LIMIT 1) RETURNING id,user_id,payload"
            }
            Self::AccountReconcileJobSelectSessions => {
                "SELECT s.id_hash,s.upstream_key,s.upstream_key_id FROM sessions s JOIN credential_revocations r ON r.session_hash=s.id_hash WHERE s.user_id=?"
            }
            Self::AccountReconcileJobDeleteCredentialRevocations => {
                "DELETE FROM credential_revocations WHERE session_hash=?"
            }
            Self::AccountReconcileJobSelectCredentialJobs => {
                "SELECT EXISTS(SELECT 1 FROM credential_jobs WHERE id=? AND lease_until=? AND payload=?)"
            }
            Self::AccountReconcileJobUpdatePlatformUsers => {
                "UPDATE platform_users SET status=? WHERE id=?"
            }
            Self::AccountReconcileJobDeleteCredentialJobs => {
                "DELETE FROM credential_jobs WHERE id=? AND lease_until=?"
            }
            Self::AccountReconcileJobUpdateCredentialJobs2 => {
                "UPDATE credential_jobs SET attempts=attempts+1,lease_until=0,next_attempt=? WHERE id=? AND lease_until=?"
            }
            Self::AccountPutSettingsUpdatePlatformSettings => {
                "UPDATE platform_settings SET value=? WHERE key='registration'"
            }
            Self::AccountTasksSelectCredentialRevocations => {
                "SELECT count(*) FROM credential_revocations"
            }
            Self::AccountTasksSelectCredentialJobs => "SELECT count(*) FROM credential_jobs",
            Self::RegistrationSettingsSelectPlatformSettings => {
                "SELECT value FROM platform_settings WHERE key='registration'"
            }
            Self::RegistrationChallengeInsertVerificationChallenges => {
                "INSERT INTO verification_challenges(id,email,purpose,code_hash,expires_at) VALUES (?,?,?,?,?)"
            }
            Self::RegistrationVerifyUpdateVerificationChallenges => {
                "UPDATE verification_challenges SET attempts=attempts+1 WHERE id=? AND expires_at>? AND attempts<5 AND consumed_at IS NULL AND verified_at IS NULL RETURNING code_hash"
            }
            Self::RegistrationVerifyUpdateVerificationChallenges2 => {
                "UPDATE verification_challenges SET verified_at=?,claim_hash=? WHERE id=? AND verified_at IS NULL AND consumed_at IS NULL"
            }
            Self::RegistrationAvailabilitySelectPlatformUsers => {
                "SELECT count(*) FROM platform_users WHERE email=?"
            }
            Self::RegistrationRegisterSelectVerificationChallenges => {
                "SELECT email FROM verification_challenges WHERE id=? AND purpose='registration' AND claim_hash=? AND verified_at IS NOT NULL AND expires_at>?"
            }
            Self::RegistrationRegisterSelectPlatformUsers => {
                "SELECT id,email,status FROM platform_users WHERE challenge_id=? OR (email=? AND recovery_email=? AND status='provisioning')"
            }
            Self::RegistrationRegisterSelectPlatformUsers2 => {
                "SELECT count(*) FROM platform_users WHERE operator=0"
            }
            Self::RegistrationRegisterInsertPlatformUsers => {
                "INSERT INTO platform_users(id,email,recovery_email,status,challenge_id,hourly_recipients,daily_recipients,quota_bytes) VALUES (?,?,?,'provisioning',?,?,?,?)"
            }
            Self::RegistrationRegisterUpdatePlatformUsers => {
                "UPDATE platform_users SET provisioning_lease=?,challenge_id=? WHERE id=? AND provisioning_lease<=?"
            }
            Self::RegistrationRegisterDeletePlatformUsers => {
                "DELETE FROM platform_users WHERE id=? AND status='provisioning' AND stalwart_id IS NULL"
            }
            Self::RegistrationRegisterUpdatePlatformUsers2 => {
                "UPDATE platform_users SET stalwart_id=? WHERE id=? AND status='provisioning'"
            }
            Self::RegistrationRegisterUpdatePlatformUsers3 => {
                "UPDATE platform_users SET stalwart_id=?,status='active',provisioning_lease=0 WHERE id=? AND status='provisioning'"
            }
            Self::RegistrationRegisterUpdateVerificationChallenges => {
                "UPDATE verification_challenges SET consumed_at=? WHERE id=?"
            }
            Self::RegistrationRecoverUpdateVerificationChallenges => {
                "UPDATE verification_challenges SET consumed_at=? WHERE id=? AND purpose='recovery' AND claim_hash=? AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at>? RETURNING email"
            }
            Self::PolicySyncScopeSelectPlatformUsers => {
                "SELECT email,stalwart_id FROM platform_users WHERE stalwart_id IS NOT NULL"
            }
            Self::PolicyRateInsertRequestLimits => {
                "INSERT INTO request_limits(bucket,window_start,count) VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN window_start<=? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END RETURNING count"
            }
            Self::PolicyReserveSelectPlatformUsers => {
                "SELECT id,status,hourly_recipients,daily_recipients FROM platform_users WHERE email=? OR stalwart_id=? OR email=?"
            }
            Self::PolicyReserveSelectOutboundReservations => {
                "SELECT COALESCE(sum(recipient_count),0) FROM outbound_reservations WHERE user_id=? AND created_at>?"
            }
            Self::PolicyReserveSelectOutboundReservations2 => {
                "SELECT COALESCE(sum(recipient_count),0) FROM outbound_reservations WHERE user_id=? AND created_at>?"
            }
            Self::PolicyReserveInsertOutboundReservations => {
                "INSERT INTO outbound_reservations(event_id,user_id,recipient_count,created_at) VALUES (?,?,?,?)"
            }
            Self::MailDraftSelectUploadOwnership => {
                "SELECT size,type FROM upload_ownership WHERE user_id=? AND blob_id=?"
            }
            Self::MailSendInsertOperations => {
                "INSERT OR IGNORE INTO operations(id,user_id,kind,idempotency_key,status,request_hash) VALUES (?,?,'send',?,'pending',?)"
            }
            Self::MailSendSelectOperations => {
                "SELECT id,status,request_hash,result FROM operations WHERE user_id=? AND kind='send' AND idempotency_key=?"
            }
            Self::MailSendUpdateOperations => "UPDATE operations SET status='failed' WHERE id=?",
            Self::MailSendUpdateOperations2 => "UPDATE operations SET result=? WHERE id=?",
            Self::MailSendUpdateOperations3 => {
                "UPDATE operations SET status='succeeded',result=? WHERE id=?"
            }
            Self::MailSendUpdateOperations4 => "UPDATE operations SET status=? WHERE id=?",
            Self::MailSubmissionStatusUpdateOperations => {
                "UPDATE operations SET status='succeeded' WHERE id=?"
            }
            Self::MailUploadInsertUploadOwnership => {
                "INSERT OR IGNORE INTO upload_ownership(user_id,blob_id,size,type,created_at) VALUES (?,?,?,?,?)"
            }
            Self::MailEventsSelectSessions => {
                "SELECT EXISTS(SELECT 1 FROM sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen>? AND u.status='active')"
            }
            Self::BootstrapOperatorSelectPlatformUsers => {
                "SELECT operator,status FROM platform_users WHERE email=?"
            }
            Self::BootstrapOperatorInsertPlatformUsers => {
                "INSERT INTO platform_users(id,email,recovery_email,status,operator) VALUES (?,?,?,'provisioning',1)"
            }
            Self::BootstrapOperatorUpdatePlatformUsers => {
                "UPDATE platform_users SET stalwart_id=? WHERE id=?"
            }
            Self::BootstrapOperatorUpdatePlatformUsers2 => {
                "UPDATE platform_users SET status='active' WHERE id=?"
            }
            Self::MainLoginSelectPlatformUsers => {
                "SELECT id,email,stalwart_id FROM platform_users WHERE email=$1 AND status='active'"
            }
            Self::MainLogoutInsertCredentialRevocations => {
                "INSERT INTO credential_revocations(session_hash) VALUES ($1) ON CONFLICT DO NOTHING"
            }
            Self::MainRevocationsDeleteCredentialRevocations => {
                "DELETE FROM credential_revocations WHERE session_hash=? AND lease_until=?"
            }
            Self::AccountAuditEventInsertAuditEvents => {
                "INSERT INTO audit_events(id,actor_id,action,subject_id,outcome) VALUES (?,?,?,?,?)"
            }
            Self::AccountUpdateUserSelectPlatformUsers => {
                "SELECT stalwart_id FROM platform_users WHERE id=? AND status IN ('active','disabled')"
            }
            Self::AccountAuditSelectAuditEvents => {
                "SELECT id,actor_id,subject_id,action,outcome,created_at FROM audit_events ORDER BY created_at DESC LIMIT 200"
            }
            Self::AccountTasksSelectPlatformUsers => {
                "SELECT count(*) FROM platform_users WHERE status IN ('provisioning','reconcile')"
            }
            Self::AccountRetryTasksUpdateCredentialJobs => {
                "UPDATE credential_jobs SET next_attempt=0 WHERE attempts>0 AND lease_until<=?"
            }
            Self::AccountRetryTasksUpdateCredentialRevocations => {
                "UPDATE credential_revocations SET next_attempt=0 WHERE attempts>0 AND lease_until<=?"
            }
            Self::RegistrationRecoverSelectPlatformUsers => {
                "SELECT id,stalwart_id FROM platform_users WHERE recovery_email=? AND status='active'"
            }
            Self::PolicyReserveSelectOutboundReservations3 => {
                "SELECT count(*) FROM outbound_reservations WHERE event_id=? AND user_id=?"
            }
            Self::MailSubmissionStatusSelectOperations => {
                "SELECT status,result FROM operations WHERE id=? AND user_id=? AND kind='send'"
            }
        }
    }
}
pub fn query<'q>(
    statement: Statement,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments> {
    sqlx::query(statement.sql())
}
pub fn scalar<'q, O>(
    statement: Statement,
) -> sqlx::query::QueryScalar<'q, sqlx::Sqlite, O, sqlx::sqlite::SqliteArguments>
where
    (O,): for<'r> sqlx::FromRow<'r, sqlx::sqlite::SqliteRow>,
{
    sqlx::query_scalar(statement.sql())
}
pub async fn begin(pool: &Pool) -> Result<sqlx::Transaction<'_, sqlx::Sqlite>, sqlx::Error> {
    pool.begin_with("BEGIN IMMEDIATE").await
}
pub async fn version() -> Result<String, sqlx::Error> {
    let pool = SqlitePool::connect("sqlite::memory:").await?;
    sqlx::query_scalar("SELECT sqlite_version()")
        .fetch_one(&pool)
        .await
}

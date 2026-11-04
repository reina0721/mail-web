use super::*;
pub async fn operator(
    app: &App,
    email: &str,
    recovery: &str,
    password_file: &str,
) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let name = email
        .strip_suffix("@iqwq.com")
        .ok_or("operator must use iqwq.com")?;
    if name.len() < 3
        || !name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        || !recovery.contains('@')
        || recovery.ends_with("@iqwq.com")
    {
        return Err("invalid operator or external recovery email".into());
    }
    if let Some(existing) = db::query(db::Statement::BootstrapOperatorSelectPlatformUsers)
        .bind(email)
        .fetch_optional(&app.db)
        .await?
    {
        if existing.get::<bool, _>("operator") && existing.get::<String, _>("status") == "active" {
            println!("Independent platform operator already initialized: {email}");
            return Ok(());
        }
        return Err("operator address already mapped; no changes made".into());
    }
    let password = zeroize::Zeroizing::new(std::fs::read_to_string(password_file)?);
    if password.trim().len() < 16 {
        return Err("initial password must have at least 16 characters".into());
    }
    let id = Uuid::new_v4();
    let marker = format!("mail-web:{id}");
    // Reserve locally before creating upstream. Ambiguous failures retain this
    // record for reconciliation; this command never adopts an existing account.
    db::query(db::Statement::BootstrapOperatorInsertPlatformUsers)
        .bind(id)
        .bind(email)
        .bind(recovery)
        .execute(&app.db)
        .await?;
    let created=app.upstream.call(&app.services.provisioning_key,"x:Account/set",json!({"create":{"operator":{"@type":"User","name":name,"domainId":app.services.domain_id,"description":marker,"roles":{"@type":"User"},"credentials":{"0":{"@type":"Password","secret":password.trim()}},"permissions":account::user_permissions(false),"quotas":{"maxDiskQuota":1073741824,"maxApiKeys":64}}}})).await?;
    let account = created["created"]["operator"]["id"]
        .as_str()
        .ok_or("operator creation result unknown")?;
    db::query(db::Statement::BootstrapOperatorUpdatePlatformUsers)
        .bind(account)
        .bind(id)
        .execute(&app.db)
        .await?;
    policy::sync_scope(app)
        .await
        .map_err(|_| "submission scope synchronization failed")?;
    let mut update = json!({});
    update[account] = json!({"permissions":account::user_permissions(true)});
    app.upstream
        .call(
            &app.services.provisioning_key,
            "x:Account/set",
            json!({"update":update}),
        )
        .await?;
    db::query(db::Statement::BootstrapOperatorUpdatePlatformUsers2)
        .bind(id)
        .execute(&app.db)
        .await?;
    println!("Independent platform operator created: {email}");
    Ok(())
}

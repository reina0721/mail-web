use super::*;

pub(super) async fn validate(app: &App, access: &Grant, spec: &Spec) -> Result<()> {
    if !access.missing_permissions(spec.create_domain).is_empty() {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "initialization_permissions_missing",
        ));
    }
    if spec.brand.trim().is_empty()
        || spec.brand.len() > 80
        || !valid_domain(&spec.domain)
        || config::validate_origin(&spec.public_origin).is_err()
    {
        return Err(Error(StatusCode::BAD_REQUEST, "site_configuration_invalid"));
    }
    if configured(app)
        && app.services.domain != spec.domain
        && db::scalar::<i64>(db::Statement::InstallationUserCount)
            .fetch_one(&app.db)
            .await?
            > 0
    {
        return Err(Error(StatusCode::CONFLICT, "domain_has_accounts"));
    }
    // A source change is not an account/data migration.
    if configured(app)
        && app.upstream.base != access.base
        && db::scalar::<i64>(db::Statement::InstallationUserCount)
            .fetch_one(&app.db)
            .await?
            > 0
    {
        return Err(Error(
            StatusCode::CONFLICT,
            "initialization_server_migration_required",
        ));
    }
    access
        .call(app, "x:MtaHook/get", json!({"properties":["id","url"]}))
        .await?;
    let domains = access
        .call(app, "x:Domain/get", json!({"properties":["id","name"]}))
        .await?;
    if !spec.create_domain
        && !domains["list"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|d| d["name"] == spec.domain)
    {
        return Err(Error(StatusCode::BAD_REQUEST, "configured_domain_missing"));
    }
    if !spec.cloudflare_account.is_empty() {
        cloudflare::validate(app, &access.cloudflare_token, &spec.cloudflare_account).await?;
    }
    if db::scalar::<i64>(db::Statement::InstallationOperatorCount)
        .fetch_one(&app.db)
        .await?
        == 0
    {
        let Some(name) = spec
            .operator_email
            .strip_suffix(&format!("@{}", spec.domain))
        else {
            return Err(Error(StatusCode::BAD_REQUEST, "operator_identity_invalid"));
        };
        if !valid_name(name)
            || !spec.recovery_email.contains('@')
            || spec.recovery_email.ends_with(&format!("@{}", spec.domain))
            || access.operator_password.is_empty()
            || (spec.operator_mode == "new" && access.operator_password.len() < 12)
            || access.operator_password.len() > 512
            || !matches!(spec.operator_mode.as_str(), "existing" | "new")
        {
            return Err(Error(StatusCode::BAD_REQUEST, "operator_identity_invalid"));
        }
        if spec.operator_mode == "existing" {
            let upstream = Stalwart {
                http: app.upstream.http.clone(),
                base: access.base.clone(),
            };
            upstream
                .password_session(&spec.operator_email, &access.operator_password)
                .await?;
        }
    }
    Ok(())
}
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"-_.".contains(&b))
}
fn valid_domain(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 253
        && name.contains('.')
        && name.split('.').all(|p| {
            !p.is_empty()
                && p.len() <= 63
                && !p.starts_with('-')
                && !p.ends_with('-')
                && p.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}
async fn checkpoint(
    app: &App,
    job: &mut Job,
    cancel: &tokio_util::sync::CancellationToken,
    step: &str,
) -> Result<()> {
    if cancel.is_cancelled() {
        return Err(Error(StatusCode::CONFLICT, "initialization_cancelled"));
    }
    job.step = step.into();
    let _guard = JOB_LOCK.lock().await;
    journal::write(app, job)
}
fn created(value: &Value, name: &str) -> Result<String> {
    value["created"][name]["id"]
        .as_str()
        .map(str::to_owned)
        .ok_or(Error(
            StatusCode::BAD_GATEWAY,
            "initialization_create_rejected",
        ))
}
async fn domain(app: &App, job: &mut Job, access: &Grant) -> Result<()> {
    if !job.resource("domain").is_empty() {
        return Ok(());
    }
    let value = access
        .call(app, "x:Domain/get", json!({"properties":["id","name"]}))
        .await?;
    let id = if let Some(found) = value["list"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|d| d["name"] == job.spec.domain)
    {
        found["id"]
            .as_str()
            .ok_or_else(|| internal("domain_id_missing"))?
            .to_owned()
    } else {
        if !job.spec.create_domain {
            return Err(Error(StatusCode::BAD_REQUEST, "configured_domain_missing"));
        }
        created(
            &access
                .call(
                    app,
                    "x:Domain/set",
                    json!({"create":{"domain":{"name":job.spec.domain}}}),
                )
                .await?,
            "domain",
        )?
    };
    job.resources.insert("domain".into(), id);
    journal::write(app, job)
}
async fn service(
    app: &App,
    job: &mut Job,
    access: &Grant,
    kind: &str,
    permissions: Value,
) -> Result<()> {
    let name = job.name(kind);
    let marker = format!("mail-web:{}:{kind}", job.id);
    let domain = job.resource("domain");
    if job.resource(kind).is_empty() {
        let found = access
            .call(
                app,
                "x:Account/get",
                json!({"properties":["id","name","domainId","description"]}),
            )
            .await?;
        let candidates: Vec<_> = found["list"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|a| a["name"] == name && a["domainId"] == domain)
            .collect();
        let id = if candidates.is_empty() {
            let password = job
                .secrets
                .entry(format!("{kind}-password"))
                .or_insert_with(token)
                .clone();
            journal::write(app, job)?;
            let value=access.call(app,"x:Account/set",json!({"create":{"service":{"@type":"User","name":name,"domainId":domain,"description":marker,"roles":{"@type":"User"},"credentials":{"0":{"@type":"Password","secret":password}},"permissions":permissions,"quotas":{"maxApiKeys":64}}}})).await?;
            created(&value, "service")?
        } else if candidates.len() == 1
            && candidates[0]["description"] == marker
            && job.secrets.contains_key(&format!("{kind}-password"))
        {
            candidates[0]["id"]
                .as_str()
                .ok_or_else(|| internal("account_id_missing"))?
                .to_owned()
        } else {
            return Err(Error(
                StatusCode::CONFLICT,
                "initialization_resource_conflict",
            ));
        };
        job.resources.insert(kind.into(), id);
        journal::write(app, job)?;
    }
    if job.secret(kind).is_empty() {
        let upstream = Stalwart {
            http: app.upstream.http.clone(),
            base: access.base.clone(),
        };
        let password = job.secret(&format!("{kind}-password"));
        // Query before retrying a lost create response; revoke only this job's
        // unreachable key, never a credential outside the owned service account.
        let email = format!("{name}@{}", job.spec.domain);
        let keys = upstream
            .password_call(
                &email,
                &password,
                "x:ApiKey/get",
                json!({"properties":["id","description"]}),
            )
            .await?;
        let orphaned: Vec<_> = keys["list"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|k| k["description"] == marker)
            .filter_map(|k| k["id"].as_str())
            .collect();
        if !orphaned.is_empty() {
            upstream
                .password_call(
                    &email,
                    &password,
                    "x:ApiKey/set",
                    json!({"destroy":orphaned}),
                )
                .await?;
        }
        // Stalwart requires a manager to hold every permission of the users it
        // updates. Inherit the dedicated non-admin User identity plus its explicit
        // directory permissions; do not inherit the bootstrap administrator.
        let key_permissions = if kind == "directory" {
            json!({"@type":"Inherit"})
        } else {
            json!({"@type":"Replace","permissions":{"authenticate":true,"emailSend":true,"jmapMailboxGet":true,"jmapEmailCreate":true,"jmapIdentityGet":true,"jmapEmailSubmissionCreate":true}})
        };
        let value = upstream
            .password_call(
                &email,
                &password,
                "x:ApiKey/set",
                json!({"create":{"key":{"description":marker,"permissions":key_permissions}}}),
            )
            .await?;
        let secret = value["created"]["key"]["secret"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or(Error(
                StatusCode::BAD_GATEWAY,
                "initialization_key_result_missing",
            ))?;
        job.secrets.insert(kind.into(), secret.into());
        job.resources
            .insert(format!("{kind}Key"), created(&value, "key")?);
        journal::write(app, job)?;
        // No generated account password is needed after durable API-key capture.
        job.secrets.remove(&format!("{kind}-password"));
        journal::write(app, job)?;
    }
    Ok(())
}
async fn hook(app: &App, job: &mut Job, access: &Grant) -> Result<()> {
    if !job.resource("hook").is_empty() {
        return Ok(());
    }
    let callback = format!("{}/internal/mta-hook", job.spec.public_origin);
    let values = access.call(app, "x:MtaHook/get", json!({})).await?;
    let list: Vec<_> = values["list"].as_array().into_iter().flatten().collect();
    let secret = job
        .secrets
        .entry("hook".into())
        .or_insert_with(token)
        .clone();
    if let Some(before) = job.pending.get("hook") {
        let candidates: Vec<_> = list
            .iter()
            .filter(|h| {
                h["url"] == callback
                    && h["id"]
                        .as_str()
                        .is_some_and(|id| !before.iter().any(|b| b == id))
            })
            .collect();
        if !candidates.is_empty() {
            if candidates.len() != 1 || candidates[0]["httpAuth"]["bearerToken"]["secret"] != secret
            {
                return Err(Error(
                    StatusCode::CONFLICT,
                    "initialization_hook_result_ambiguous",
                ));
            }
            job.resources.insert(
                "hook".into(),
                candidates[0]["id"]
                    .as_str()
                    .ok_or_else(|| internal("hook_id_missing"))?
                    .into(),
            );
            return journal::write(app, job);
        }
    } else {
        job.pending.insert(
            "hook".into(),
            list.iter()
                .filter_map(|h| h["id"].as_str().map(str::to_owned))
                .collect(),
        );
    }
    journal::write(app, job)?;
    let value=access.call(app,"x:MtaHook/set",json!({"create":{"hook":{"url":callback,"enable":{"else":"false"},"stages":{"data":true},"timeout":5000,"tempFailOnError":true,"maxResponseSize":4096,"httpAuth":{"@type":"Bearer","bearerToken":{"@type":"Value","secret":secret}}}}})).await?;
    job.resources
        .insert("hook".into(), created(&value, "hook")?);
    journal::write(app, job)
}
async fn operator(app: &App, job: &mut Job, access: &Grant, runtime: &App) -> Result<()> {
    if db::scalar::<i64>(db::Statement::InstallationOperatorCount)
        .fetch_one(&app.db)
        .await?
        > 0
    {
        return Ok(());
    }
    if job.spec.operator_mode == "new" && job.resource("operator").is_empty() {
        let name = job
            .spec
            .operator_email
            .split('@')
            .next()
            .unwrap_or_default();
        let marker = format!("mail-web:{}:operator", job.id);
        let found = access
            .call(
                app,
                "x:Account/get",
                json!({"properties":["id","name","domainId","description"]}),
            )
            .await?;
        let candidates: Vec<_> = found["list"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|a| a["name"] == name && a["domainId"] == job.resource("domain"))
            .collect();
        let id = if candidates.is_empty() {
            created(&access.call(app,"x:Account/set",json!({"create":{"operator":{"@type":"User","name":name,"domainId":job.resource("domain"),"description":marker,"roles":{"@type":"User"},"credentials":{"0":{"@type":"Password","secret":access.operator_password}},"permissions":account::user_permissions(true),"quotas":{"maxDiskQuota":1073741824,"maxApiKeys":64}}}})).await?,"operator")?
        } else if candidates.len() == 1 && candidates[0]["description"] == marker {
            candidates[0]["id"]
                .as_str()
                .ok_or_else(|| internal("operator_id_missing"))?
                .to_owned()
        } else {
            return Err(Error(StatusCode::CONFLICT, "operator_address_exists"));
        };
        job.resources.insert("operator".into(), id);
        journal::write(app, job)?;
    }
    let session = runtime
        .upstream
        .password_session(&job.spec.operator_email, &access.operator_password)
        .await?;
    let account = session["primaryAccounts"]["urn:ietf:params:jmap:mail"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_REQUEST, "mail_account_required"))?;
    let info = runtime
        .upstream
        .call(
            &runtime.services.provisioning_key,
            "x:Account/get",
            json!({"ids":[account],"properties":["id","name","domainId","roles","permissions"]}),
        )
        .await?;
    let item = &info["list"][0];
    if privileged_permissions(item)
        || item["roles"]["@type"] != "User"
        || item["domainId"] != runtime.services.domain_id
        || item["name"].as_str() != job.spec.operator_email.split('@').next()
    {
        return Err(Error(StatusCode::BAD_REQUEST, "ordinary_mailbox_required"));
    }
    db::query(db::Statement::InstallationEnrollOperator)
        .bind(Uuid::new_v4())
        .bind(&job.spec.operator_email)
        .bind(&job.spec.recovery_email)
        .bind(account)
        .execute(&app.db)
        .await?;
    Ok(())
}
pub(super) async fn run(
    app: &App,
    job: &mut Job,
    access: &Grant,
    cancel: &tokio_util::sync::CancellationToken,
) -> Result<()> {
    checkpoint(app, job, cancel, "domain").await?;
    domain(app, job, access).await?;
    checkpoint(app, job, cancel, "directory").await?;
    let management = json!({"@type":"Merge","enabledPermissions":{"sysAccountCreate":true,"sysAccountGet":true,"sysAccountQuery":true,"sysAccountUpdate":true,"sysDomainGet":true,"sysDomainQuery":true,"sysMtaHookGet":true,"sysMtaHookUpdate":true,"sysActionCreate":true,"actionReloadSettings":true}});
    service(app, job, access, "directory", management).await?;
    checkpoint(app, job, cancel, "notification").await?;
    service(
        app,
        job,
        access,
        "notification",
        json!({"@type":"Merge","enabledPermissions":{}}),
    )
    .await?;
    checkpoint(app, job, cancel, "hook").await?;
    hook(app, job, access).await?;
    checkpoint(app, job, cancel, "turnstile").await?;
    cloudflare::create(app, job, &access.cloudflare_token).await?;
    let services = config::Services {
        domain: job.spec.domain.clone(),
        brand: job.spec.brand.clone(),
        domain_id: job.resource("domain"),
        provisioning_key: job.secret("directory"),
        notification_key: job.secret("notification"),
        notification_account: job.resource("notification"),
        notification_email: format!("{}@{}", job.name("notification"), job.spec.domain),
        hook_secret: job.secret("hook"),
        hook_id: job.resource("hook"),
        turnstile_secret: if job.spec.cloudflare_account.is_empty() {
            app.services.turnstile_secret.clone()
        } else {
            job.secret("turnstile")
        },
        turnstile_site_key: if job.spec.cloudflare_account.is_empty() {
            app.services.turnstile_site_key.clone()
        } else {
            job.resource("turnstile")
        },
        policy_verified: false,
    };
    let runtime = App {
        db: app.db.clone(),
        upstream: Stalwart {
            http: app.upstream.http.clone(),
            base: job.base.clone(),
        },
        vault: app.vault.clone(),
        origin: job.spec.public_origin.clone(),
        services: services.clone(),
    };
    checkpoint(app, job, cancel, "operator").await?;
    operator(app, job, access, &runtime).await?;
    checkpoint(app, job, cancel, "scope").await?;
    // Scope activation is deferred until restart and callback authentication.
    checkpoint(app, job, cancel, "verify").await?;
    runtime.upstream.session(&services.provisioning_key).await?;
    runtime.upstream.session(&services.notification_key).await?;
    runtime
        .upstream
        .call(
            &services.notification_key,
            "Mailbox/get",
            json!({"accountId":services.notification_account}),
        )
        .await?;
    let identities = runtime
        .upstream
        .call(
            &services.notification_key,
            "Identity/get",
            json!({"accountId":services.notification_account}),
        )
        .await?;
    if !identities["list"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|identity| identity["email"] == services.notification_email)
    {
        return Err(Error(
            StatusCode::BAD_GATEWAY,
            "notification_identity_missing",
        ));
    }
    checkpoint(app, job, cancel, "apply").await?;
    let _configuration = CONFIG_LOCK.lock().await;
    if !job.secrets.contains_key("previous-config")
        && let Some(previous) = load(&app.vault).map_err(|_| internal("initialization_read"))?
    {
        job.secrets.insert(
            "previous-config".into(),
            serde_json::to_string(&previous).map_err(|_| internal("initialization_encode"))?,
        );
        journal::write(app, job)?;
    }
    persist(
        &app.vault,
        &RuntimeConfig {
            version: 1,
            origin: job.spec.public_origin.clone(),
            stalwart_url: job.base.clone(),
            services,
        },
    )?;
    job.completed = vec![
        "domain",
        "directory",
        "notification",
        "hook",
        "turnstile",
        "operator",
        "scope",
        "verify",
        "apply",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    job.step = "apply".into();
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn domain_and_mailbox_names_are_not_urls() {
        for value in [
            "https://example.com",
            "example.com/path",
            "a@b.com",
            "-a.com",
            "a..com",
        ] {
            assert!(!super::valid_domain(value));
        }
        assert!(super::valid_domain("example.com"));
        assert!(!super::valid_name("user@example.com"));
    }
}

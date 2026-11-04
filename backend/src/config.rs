#[derive(Clone, Default)]
pub struct Services {
    pub provisioning_key: String,
    pub notification_key: String,
    pub notification_account: String,
    pub notification_email: String,
    pub domain_id: String,
    pub turnstile_secret: String,
    pub turnstile_site_key: String,
    pub hook_secret: String,
    pub hook_id: String,
    pub policy_verified: bool,
}
fn secret(name: &str) -> String {
    std::env::var(name)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default()
        .trim()
        .to_string()
}
impl Services {
    pub fn load() -> Self {
        Self {
            provisioning_key: secret("PROVISIONING_KEY_FILE"),
            notification_key: secret("NOTIFICATION_KEY_FILE"),
            notification_account: std::env::var("NOTIFICATION_ACCOUNT_ID").unwrap_or_default(),
            notification_email: std::env::var("NOTIFICATION_EMAIL")
                .unwrap_or_else(|_| "no-reply@iqwq.com".into()),
            domain_id: std::env::var("STALWART_DOMAIN_ID").unwrap_or_default(),
            turnstile_secret: secret("TURNSTILE_SECRET_FILE"),
            turnstile_site_key: std::env::var("TURNSTILE_SITE_KEY").unwrap_or_default(),
            hook_secret: secret("MTA_HOOK_SECRET_FILE"),
            hook_id: std::env::var("STALWART_HOOK_ID").unwrap_or_default(),
            policy_verified: std::env::var("MTA_POLICY_VERIFIED").as_deref() == Ok("true"),
        }
    }
    pub fn ready(&self) -> bool {
        !self.provisioning_key.is_empty()
            && !self.notification_key.is_empty()
            && !self.domain_id.is_empty()
            && !self.turnstile_secret.is_empty()
            && !self.turnstile_site_key.is_empty()
            && !self.hook_secret.is_empty()
            && !self.hook_id.is_empty()
            && self.policy_verified
    }
}

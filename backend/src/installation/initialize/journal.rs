use super::*;

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Spec {
    pub brand: String,
    pub domain: String,
    pub public_origin: String,
    #[serde(default)]
    pub create_domain: bool,
    #[serde(default)]
    pub operator_mode: String,
    #[serde(default)]
    pub operator_email: String,
    #[serde(default)]
    pub recovery_email: String,
    #[serde(default)]
    pub cloudflare_account: String,
}
#[derive(Serialize, Deserialize)]
pub(super) struct Job {
    pub id: String,
    pub owner: String,
    pub base: String,
    pub spec: Spec,
    pub status: String,
    pub step: String,
    pub error: String,
    pub resources: HashMap<String, String>,
    pub secrets: HashMap<String, String>,
    pub completed: Vec<String>,
    pub pending: HashMap<String, Vec<String>>,
}
impl Job {
    pub fn new(owner: String, base: String, spec: Spec) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            owner,
            base,
            spec,
            status: "pending".into(),
            step: String::new(),
            error: String::new(),
            resources: HashMap::new(),
            secrets: HashMap::new(),
            completed: Vec::new(),
            pending: HashMap::new(),
        }
    }
    pub fn public(&self) -> Value {
        json!({"base":self.base,"id":self.id,"status":self.status,"step":self.step,"error":self.error,"resources":self.resources,"completed":self.completed,"spec":self.spec,"requiresAuthorization":matches!(self.status.as_str(),"failed"|"interrupted"|"cancelled"),"protocolVerified":false})
    }
    pub fn name(&self, kind: &str) -> String {
        format!("mw-{}-{kind}", self.id.replace('-', ""))
    }
    pub fn resource(&self, key: &str) -> String {
        self.resources.get(key).cloned().unwrap_or_default()
    }
    pub fn secret(&self, key: &str) -> String {
        self.secrets.get(key).cloned().unwrap_or_default()
    }
}
fn path() -> PathBuf {
    config_path().with_file_name("initialization.enc")
}
pub(super) fn read(app: &App) -> Result<Option<Job>> {
    if !path().exists() {
        return Ok(None);
    }
    let bytes = zeroize::Zeroizing::new(
        app.vault
            .open(&std::fs::read(path()).map_err(|_| internal("initialization_read"))?)
            .map_err(|_| internal("initialization_decrypt"))?,
    );
    Ok(Some(
        serde_json::from_slice(&bytes).map_err(|_| internal("initialization_journal_invalid"))?,
    ))
}
pub(super) fn write(app: &App, job: &Job) -> Result<()> {
    let data = zeroize::Zeroizing::new(
        serde_json::to_vec(job).map_err(|_| internal("initialization_encode"))?,
    );
    let encrypted = app
        .vault
        .seal(&data)
        .map_err(|_| internal("initialization_encrypt"))?;
    let path = path();
    let parent = path
        .parent()
        .ok_or_else(|| internal("initialization_path"))?;
    std::fs::create_dir_all(parent).map_err(|_| internal("initialization_directory"))?;
    let temporary = parent.join(format!(".initialization-{}.tmp", token()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| -> std::io::Result<()> {
        let mut file = options.open(&temporary)?;
        file.write_all(&encrypted)?;
        file.sync_all()?;
        std::fs::rename(&temporary, &path)?;
        #[cfg(unix)]
        std::fs::File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
        return Err(internal("initialization_write"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_progress_never_serializes_runtime_secrets_or_pending_snapshots() {
        let spec:Spec=serde_json::from_value(json!({"brand":"Mail","domain":"example.com","publicOrigin":"https://webmail.example.com"})).unwrap();
        let mut job = Job::new(
            "private-owner".into(),
            "https://mail.example.com".into(),
            spec,
        );
        job.secrets.insert("key".into(), "sensitive-value".into());
        job.pending
            .insert("hook".into(), vec!["unrelated-id".into()]);
        let output = job.public().to_string();
        for secret in ["sensitive-value", "private-owner", "unrelated-id"] {
            assert!(!output.contains(secret));
        }
    }
}

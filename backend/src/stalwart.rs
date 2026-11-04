use reqwest::Client;
use serde_json::{Value, json};

#[derive(Clone)]
pub struct Stalwart {
    pub http: Client,
    pub base: String,
}

#[derive(thiserror::Error, Debug)]
pub enum UpstreamError {
    #[error("upstream unavailable")]
    Transport(#[from] reqwest::Error),
    #[error("upstream authentication failed")]
    Authentication,
    #[error("upstream rejected operation")]
    Rejected,
    #[error("unexpected upstream response")]
    Protocol,
}

impl Stalwart {
    pub async fn session(&self, key: &str) -> Result<Value, UpstreamError> {
        let response = self
            .http
            .get(format!("{}/jmap/session", self.base))
            .bearer_auth(key)
            .send()
            .await?;
        if response.status() == 401 || response.status() == 403 {
            return Err(UpstreamError::Authentication);
        }
        if !response.status().is_success() {
            return Err(UpstreamError::Protocol);
        }
        Ok(response.json().await?)
    }
    pub async fn call(&self, key: &str, method: &str, args: Value) -> Result<Value, UpstreamError> {
        self.request(
            self.http
                .post(format!("{}/jmap/", self.base))
                .bearer_auth(key),
            method,
            args,
        )
        .await
    }
    pub async fn password_call(
        &self,
        email: &str,
        password: &str,
        method: &str,
        args: Value,
    ) -> Result<Value, UpstreamError> {
        self.request(
            self.http
                .post(format!("{}/jmap/", self.base))
                .basic_auth(email, Some(password)),
            method,
            args,
        )
        .await
    }
    async fn request(
        &self,
        req: reqwest::RequestBuilder,
        method: &str,
        args: Value,
    ) -> Result<Value, UpstreamError> {
        let using = if method.starts_with("x:") {
            json!(["urn:ietf:params:jmap:core", "urn:stalwart:jmap"])
        } else {
            json!([
                "urn:ietf:params:jmap:core",
                "urn:ietf:params:jmap:mail",
                "urn:ietf:params:jmap:submission"
            ])
        };
        let response = req
            .json(&json!({"using":using,"methodCalls":[[method,args,"c"]]}))
            .send()
            .await?;
        if response.status() == 401 || response.status() == 403 {
            return Err(UpstreamError::Authentication);
        }
        if !response.status().is_success() {
            return Err(UpstreamError::Rejected);
        }
        let body: Value = response.json().await?;
        let call = body
            .get("methodResponses")
            .and_then(Value::as_array)
            .and_then(|v| v.first())
            .ok_or(UpstreamError::Protocol)?;
        if call[0] != method {
            return Err(UpstreamError::Rejected);
        }
        let result = call[1].clone();
        for field in ["notCreated", "notUpdated", "notDestroyed"] {
            if result
                .get(field)
                .and_then(Value::as_object)
                .is_some_and(|v| !v.is_empty())
            {
                return Err(UpstreamError::Rejected);
            }
        }
        Ok(result)
    }
}

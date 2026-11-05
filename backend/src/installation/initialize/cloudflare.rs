use super::*;
const API: &str = "https://api.cloudflare.com/client/v4";
async fn request(
    app: &App,
    key: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    request_at(&app.upstream.http, API, key, method, path, body).await
}
async fn request_at(
    client: &reqwest::Client,
    base: &str,
    key: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    let mut request = client
        .request(method, format!("{base}{path}"))
        .bearer_auth(key);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| Error(StatusCode::BAD_GATEWAY, "cloudflare_unavailable"))?;
    if !response.status().is_success() {
        return Err(Error(
            StatusCode::BAD_GATEWAY,
            match response.status().as_u16() {
                401 | 403 => "cloudflare_permission_denied",
                429 => "cloudflare_rate_limited",
                _ => "cloudflare_request_failed",
            },
        ));
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| Error(StatusCode::BAD_GATEWAY, "cloudflare_response_invalid"))?;
    if value["success"] != true {
        return Err(Error(StatusCode::BAD_GATEWAY, "cloudflare_request_failed"));
    }
    Ok(value["result"].clone())
}
async fn widgets(app: &App, key: &str, endpoint: &str) -> Result<Vec<Value>> {
    let mut widgets = Vec::new();
    for page in 1..=100 {
        let result = request(
            app,
            key,
            reqwest::Method::GET,
            &format!("{endpoint}?per_page=100&page={page}"),
            None,
        )
        .await?;
        let items = result.as_array().ok_or(Error(
            StatusCode::BAD_GATEWAY,
            "cloudflare_response_invalid",
        ))?;
        widgets.extend(items.iter().cloned());
        if items.len() < 100 {
            return Ok(widgets);
        }
    }
    Err(Error(
        StatusCode::BAD_GATEWAY,
        "cloudflare_pagination_limit",
    ))
}
pub(super) fn account_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}
pub(super) async fn accounts(app: &App, key: &str) -> Result<Value> {
    match request(
        app,
        key,
        reqwest::Method::GET,
        "/accounts?per_page=50",
        None,
    )
    .await
    {
        Ok(value) => Ok(json!(
            value
                .as_array()
                .into_iter()
                .flatten()
                .map(|a| json!({"id":a["id"],"name":a["name"]}))
                .collect::<Vec<_>>()
        )),
        Err(Error(_, "cloudflare_permission_denied")) => Ok(json!([])),
        Err(e) => Err(e),
    }
}
pub(super) async fn validate(app: &App, key: &str, id: &str) -> Result<()> {
    if !account_id(id) || key.is_empty() {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "cloudflare_account_and_token_required",
        ));
    }
    request(
        app,
        key,
        reqwest::Method::GET,
        &format!("/accounts/{id}/challenges/widgets?per_page=1"),
        None,
    )
    .await?;
    Ok(())
}
pub(super) async fn create(app: &App, job: &mut Job, key: &str) -> Result<()> {
    let account = &job.spec.cloudflare_account;
    if account.is_empty() || !job.resource("turnstile").is_empty() {
        return Ok(());
    }
    let endpoint = format!("/accounts/{account}/challenges/widgets");
    let host = reqwest::Url::parse(&job.spec.public_origin)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .ok_or(Error(StatusCode::BAD_REQUEST, "public_origin_invalid"))?;
    let name = job.name("turnstile");
    // Reconcile by a unique per-installation name, exact host and creation snapshot.
    let items = widgets(app, key, &endpoint).await?;
    let candidates: Vec<_> = items.iter().filter(|w| w["name"] == name).collect();
    let widget = if candidates.is_empty() {
        job.pending.entry("turnstile".into()).or_default();
        journal::write(app, job)?;
        request(
            app,
            key,
            reqwest::Method::POST,
            &endpoint,
            Some(json!({"name":name,"domains":[host],"mode":"managed"})),
        )
        .await?
    } else if candidates.len() == 1
        && job.pending.contains_key("turnstile")
        && candidates[0]["domains"] == json!([host])
    {
        let site = candidates[0]["sitekey"]
            .as_str()
            .ok_or_else(|| internal("turnstile_result_missing"))?;
        request(
            app,
            key,
            reqwest::Method::GET,
            &format!("{endpoint}/{site}"),
            None,
        )
        .await?
    } else {
        return Err(Error(StatusCode::CONFLICT, "turnstile_resource_conflict"));
    };
    let site = widget["sitekey"]
        .as_str()
        .ok_or_else(|| internal("turnstile_result_missing"))?;
    let secret = widget["secret"]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or(Error(StatusCode::CONFLICT, "turnstile_secret_unavailable"))?;
    job.resources.insert("turnstile".into(), site.into());
    job.secrets.insert("turnstile".into(), secret.into());
    journal::write(app, job)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn cloudflare_transport_handles_create_permission_limit_redirect_and_timeout() {
        use axum::{extract::OriginalUri, http::StatusCode, response::IntoResponse};
        let router=Router::new().fallback(|OriginalUri(uri):OriginalUri,headers:HeaderMap,Json(body):Json<Value>|async move{
            assert_eq!(headers.get("authorization").unwrap(),"Bearer isolated-cloudflare-token");
            match uri.path(){
                "/forbidden"=>(StatusCode::FORBIDDEN,Json(json!({"success":false}))).into_response(),
                "/limited"=>(StatusCode::TOO_MANY_REQUESTS,Json(json!({"success":false}))).into_response(),
                "/redirect"=>(StatusCode::FOUND,[("location","https://unrelated.invalid/steal")]).into_response(),
                "/slow"=>{tokio::time::sleep(std::time::Duration::from_secs(2)).await;Json(json!({"success":true,"result":{}})).into_response()},
                _=>{assert_eq!(body["mode"],"managed");assert_eq!(body["domains"],json!(["webmail.example.com"]));Json(json!({"success":true,"result":{"sitekey":"isolated-sitekey","secret":"isolated-widget-secret"}})).into_response()}
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_millis(500))
            .build()
            .unwrap();
        let base = format!("http://{address}");
        for (path, code) in [
            ("/forbidden", "cloudflare_permission_denied"),
            ("/limited", "cloudflare_rate_limited"),
            ("/redirect", "cloudflare_request_failed"),
            ("/slow", "cloudflare_unavailable"),
        ] {
            let error = request_at(
                &client,
                &base,
                "isolated-cloudflare-token",
                reqwest::Method::POST,
                path,
                Some(json!({})),
            )
            .await
            .unwrap_err();
            assert_eq!(error.1, code);
        }
        let widget = request_at(
            &client,
            &base,
            "isolated-cloudflare-token",
            reqwest::Method::POST,
            "/widgets",
            Some(json!({"mode":"managed","domains":["webmail.example.com"]})),
        )
        .await
        .unwrap();
        assert_eq!(widget["sitekey"], "isolated-sitekey");
        assert_eq!(widget["secret"], "isolated-widget-secret");
        server.abort();
    }
    #[test]
    fn account_paths_reject_injection() {
        for value in [
            "../widgets",
            "account?token=secret",
            "",
            "https://example.com",
        ] {
            assert!(!super::account_id(value));
        }
        assert!(super::account_id("0123456789abcdef0123456789abcdef"));
    }
}

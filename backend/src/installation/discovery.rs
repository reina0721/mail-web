use super::*;

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiscoveryInput {
    stalwart_url: String,
    provisioning_key: Option<String>,
    domain: Option<String>,
    public_origin: Option<String>,
}

pub(super) fn documentation_url() -> String {
    let repository =
        std::env::var("RELEASE_REPOSITORY").unwrap_or_else(|_| "reina0721/mail-web".into());
    let parts: Vec<_> = repository.split('/').collect();
    let valid = parts.len() == 2
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
        });
    format!(
        "https://github.com/{}/blob/main/docs/stalwart-setup.md",
        if valid {
            &repository
        } else {
            "reina0721/mail-web"
        }
    )
}

pub(super) fn missing(s: &config::Services) -> Vec<String> {
    [
        (s.domain.is_empty(), "邮箱域名"),
        (s.domain_id.is_empty(), "自动读取的域名 ID"),
        (s.provisioning_key.is_empty(), "目录服务密钥"),
        (s.notification_account.is_empty(), "验证邮件账号"),
        (
            !s.is_local_address(&s.notification_email),
            "验证邮件发件地址",
        ),
        (s.notification_key.is_empty(), "验证邮件密钥"),
        (s.turnstile_site_key.is_empty(), "Turnstile Site Key"),
        (s.turnstile_secret.is_empty(), "Turnstile Secret"),
        (s.hook_id.is_empty(), "本部署专用 MTA Hook"),
        (s.hook_secret.is_empty(), "Hook 共享密钥"),
        (!s.policy_verified, "SMTP／JMAP 提交协议验收声明"),
    ]
    .into_iter()
    .filter(|(absent, _)| *absent)
    .map(|(_, name)| name.to_owned())
    .collect()
}

pub(super) fn connection_key(app: &App, base: &str, supplied: Option<String>) -> Result<String> {
    if let Some(value) = supplied.filter(|s| !s.trim().is_empty()) {
        return Ok(value.trim().to_owned());
    }
    if base != app.upstream.base {
        return Err(Error(StatusCode::BAD_REQUEST, "new_server_key_required"));
    }
    if app.services.provisioning_key.is_empty() {
        return Err(Error(StatusCode::BAD_REQUEST, "provisioning_key_required"));
    }
    Ok(app.services.provisioning_key.clone())
}

fn section_error(error: stalwart::UpstreamError) -> &'static str {
    match error {
        stalwart::UpstreamError::Authentication | stalwart::UpstreamError::Rejected => {
            "permission_denied"
        }
        _ => "request_failed",
    }
}

fn public_callback(raw: &str) -> String {
    if let Ok(mut url) = reqwest::Url::parse(raw) {
        if !matches!(url.scheme(), "https" | "http") {
            return "[非 HTTP 回调]".into();
        }
        let _ = url.set_username("");
        let _ = url.set_password(None);
        url.set_query(None);
        url.set_fragment(None);
        url.to_string()
    } else {
        "[无法解析的回调地址]".into()
    }
}

fn schema_target(base: &reqwest::Url, location: &str) -> Option<reqwest::Url> {
    let target = base.join(location).ok()?;
    (target.origin() == base.origin()
        && target.username().is_empty()
        && target.password().is_none()
        && target.fragment().is_none()
        && (target.path() == "/api/schema" || target.path().starts_with("/api/schema/")))
    .then_some(target)
}

async fn read_schema(upstream: &Stalwart, key: &str) -> Option<Value> {
    let base = reqwest::Url::parse(&upstream.base).ok()?;
    let mut target = base.join("/api/schema").ok()?;
    for _ in 0..3 {
        let mut response = upstream
            .http
            .get(target)
            .bearer_auth(key)
            .send()
            .await
            .ok()?;
        if response.status().is_redirection() {
            target = schema_target(
                &base,
                response
                    .headers()
                    .get(reqwest::header::LOCATION)?
                    .to_str()
                    .ok()?,
            )?;
            continue;
        }
        if !response.status().is_success() {
            return None;
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.ok()? {
            if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
                return None;
            }
            bytes.extend_from_slice(&chunk);
        }
        return serde_json::from_slice(&bytes).ok();
    }
    None
}

// Only routes advertised by the actual schema's layout are eligible deep links.
fn schema_routes(schema: &Value, base: &str) -> Value {
    fn visit(value: &Value, prefix: &str, routes: &mut Vec<String>) {
        match value {
            Value::Object(map) => {
                if let Some(view) = map.get("viewName").and_then(Value::as_str)
                    && !view
                        .split('/')
                        .any(|p| p.is_empty() || p == "." || p == "..")
                    && view
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"/:_-".contains(&b))
                {
                    routes.push(format!("/{prefix}/{view}"));
                }
                for child in map.values() {
                    visit(child, prefix, routes);
                }
            }
            Value::Array(items) => {
                for child in items {
                    visit(child, prefix, routes);
                }
            }
            _ => {}
        }
    }
    let mut routes = Vec::new();
    // The UI is mounted at /admin and /account; management layouts use /admin.
    if let Some(layouts) = schema["layouts"].as_array() {
        for layout in layouts {
            if let Some(name) = layout["name"].as_str().filter(|n| {
                !n.is_empty() && n.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            }) {
                let mount = if name == "Account" {
                    "account"
                } else {
                    "admin"
                };
                visit(&layout["items"], &format!("{mount}/{name}"), &mut routes);
            }
        }
    }
    let find = |needle: &str, fallback: &str| {
        routes
            .iter()
            .find(|p| {
                p.rsplit('/').next() == Some(needle)
                    || (needle == "x:Account/User" && p.ends_with(needle))
            })
            .map(|p| format!("{base}{p}"))
            .unwrap_or_else(|| format!("{base}{fallback}"))
    };
    json!({"admin":format!("{base}/admin/"),"account":format!("{base}/account/"),"domains":find("x:Domain","/admin/"),"accounts":find("x:Account/User","/admin/"),"hooks":find("x:MtaHook","/admin/"),"keys":find("x:ApiKey","/account/")})
}

#[utoipa::path(post,path="/api/v1/installation/discover",tag="installation",request_body=DiscoveryInput,responses((status=200,body=Value),(status=401,description="Installation token or operator required"),(status=400,description="Invalid source or missing key")))]
pub(crate) async fn discover(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<DiscoveryInput>,
) -> Result<Json<Value>> {
    authorize(&app, &headers, true).await?;
    let raw = input.stalwart_url.trim();
    let raw = if raw.contains("://") {
        raw.to_owned()
    } else {
        format!("https://{raw}")
    };
    let parsed = reqwest::Url::parse(&raw)
        .map_err(|_| Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"))?;
    let test_http = std::env::var("ALLOW_INSECURE_TEST_UPSTREAM").as_deref() == Ok("true");
    if !(parsed.scheme() == "https" || (test_http && parsed.scheme() == "http"))
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
    {
        return Err(Error(StatusCode::BAD_REQUEST, "stalwart_url_invalid"));
    }
    let base = parsed.origin().ascii_serialization();
    let key = connection_key(&app, &base, input.provisioning_key)?;
    let upstream = Stalwart {
        http: app.upstream.http.clone(),
        base: base.clone(),
    };
    let domains = upstream
        .call(&key, "x:Domain/get", json!({"properties":["id","name"]}))
        .await?;
    let domains = domains["list"].as_array().cloned().unwrap_or_default();
    let selected = input.domain.as_deref().and_then(|name| {
        domains.iter().find(|d| {
            d["name"]
                .as_str()
                .is_some_and(|s| s.eq_ignore_ascii_case(name))
        })
    });
    let domain_id = selected.and_then(|d| d["id"].as_str());
    let mut accounts = Vec::new();
    let account_status = if let Some(id) = domain_id {
        // Filter before returning: directory information from other domains never reaches the client.
        match upstream
            .call(
                &key,
                "x:Account/get",
                json!({"properties":["id","name","domainId","roles","permissions"]}),
            )
            .await
        {
            Ok(value) => {
                accounts = value["list"].as_array().into_iter().flatten().filter(|a| a["domainId"] == id && a["roles"]["@type"] == "User" && !privileged_permissions(a)).map(|a| json!({"id":a["id"],"name":a["name"],"email":format!("{}@{}",a["name"].as_str().unwrap_or_default(),selected.unwrap()["name"].as_str().unwrap_or_default())})).collect();
                "ready"
            }
            Err(error) => section_error(error),
        }
    } else {
        "select_domain"
    };
    let callback = input
        .public_origin
        .as_deref()
        .and_then(|s| config::validate_origin(s).ok())
        .map(|s| format!("{s}/internal/mta-hook"));
    let (hooks,hook_status) = match upstream.call(&key,"x:MtaHook/get",json!({"properties":["id","url"]})).await {
        Ok(value) => (value["list"].as_array().into_iter().flatten().map(|h| {
            let url = h["url"].as_str().unwrap_or_default();
            json!({"id":h["id"],"url":public_callback(url),"matchesDeployment":callback.as_deref() == Some(url)})
        }).collect::<Vec<_>>(),"ready"),
        Err(error) => (Vec::new(),section_error(error)),
    };
    // Schema is optional, capped and never returned (it may contain unrelated settings).
    let schema = read_schema(&upstream, &key).await;
    let schema_status = if schema.is_some() {
        "ready"
    } else {
        "request_failed"
    };
    Ok(Json(
        json!({"stalwartUrl":base,"documentationUrl":documentation_url(),"domains":domains,"accounts":accounts,"hooks":hooks,"links":schema_routes(&schema.unwrap_or(Value::Null),&base),"sections":{"domains":"ready","accounts":account_status,"hooks":hook_status,"schema":schema_status},"callbackUrl":callback,"persisted":false}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn schema_redirects_never_forward_credentials_to_a_different_origin_or_resource() {
        let base = reqwest::Url::parse("https://mail.example.com:8443").unwrap();
        assert_eq!(
            schema_target(&base, "/api/schema/version")
                .unwrap()
                .as_str(),
            "https://mail.example.com:8443/api/schema/version"
        );
        for rejected in [
            "https://attacker.example/api/schema/v",
            "https://mail.example.com/api/schema/v",
            "/admin/",
            "/api/schema/../../admin/",
            "https://name:key@mail.example.com:8443/api/schema/v",
            "//attacker.example/api/schema/v",
        ] {
            assert!(schema_target(&base, rejected).is_none());
        }
    }
    #[test]
    fn callback_metadata_never_returns_embedded_credentials() {
        assert_eq!(
            public_callback("https://name:password@example.com/hook?secret=hidden#token"),
            "https://example.com/hook"
        );
    }
    #[test]
    fn routes_require_advertised_layout_and_stay_at_the_selected_origin() {
        let empty = schema_routes(&Value::Null, "https://mail.example.com:8443");
        assert_eq!(empty["domains"], "https://mail.example.com:8443/admin/");
        let links = schema_routes(
            &json!({"layouts":[{"name":"Management","items":[{"link":{"viewName":"x:Domain"}},{"link":{"viewName":"../evil"}}]}]}),
            "https://mail.example.com",
        );
        assert_eq!(
            links["domains"],
            "https://mail.example.com/admin/Management/x:Domain"
        );
    }
}

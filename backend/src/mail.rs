use super::*;
use axum::{
    body::Body,
    extract::Multipart,
    response::sse::{Event, KeepAlive, Sse},
};
use futures_util::StreamExt;
pub async fn clean_staging(root: &std::path::Path) -> std::io::Result<()> {
    tokio::fs::create_dir_all(root).await?;
    let mut entries = tokio::fs::read_dir(root).await?;
    while let Some(entry) = entries.next_entry().await? {
        if entry.file_type().await?.is_file()
            && entry
                .file_name()
                .to_str()
                .is_some_and(|name| Uuid::parse_str(name).is_ok())
        {
            tokio::fs::remove_file(entry.path()).await?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod staging_tests {
    use super::*;
    #[tokio::test]
    async fn restart_removes_only_abandoned_upload_files() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        tokio::fs::create_dir(&root).await.unwrap();
        let upload = root.join(Uuid::new_v4().to_string());
        let directory = root.join(Uuid::new_v4().to_string());
        tokio::fs::write(&upload, b"interrupted upload")
            .await
            .unwrap();
        tokio::fs::write(root.join("operator-note"), b"preserve")
            .await
            .unwrap();
        tokio::fs::create_dir(&directory).await.unwrap();
        clean_staging(&root).await.unwrap();
        assert!(!upload.exists());
        assert!(root.join("operator-note").exists());
        assert!(directory.is_dir());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
pub fn routes() -> Router<Arc<App>> {
    Router::new()
        .route("/mailboxes", post(create_mailbox))
        .route(
            "/mailboxes/{id}",
            axum::routing::patch(rename_mailbox).delete(delete_mailbox),
        )
        .route("/messages/batch", post(batch))
        .route("/drafts", post(save_draft))
        .route("/drafts/{id}", axum::routing::delete(delete_draft))
        .route("/submissions", post(send))
        .route("/submissions/{id}", get(submission_status))
        .route("/attachments", post(upload))
        .route("/attachments/{id}", get(download))
        .route("/events", get(events))
}
async fn boxes(app: &App, me: &Identity) -> Result<Vec<Value>> {
    let result = app
        .upstream
        .call(&me.key, "Mailbox/get", json!({"accountId":me.account}))
        .await?;
    Ok(result["list"].as_array().cloned().unwrap_or_default())
}
#[derive(Deserialize, ToSchema)]
pub(super) struct MailboxInput {
    name: String,
}
fn check_name(name: &str) -> Result<()> {
    if name.trim().is_empty() || name.chars().count() > 100 {
        return Err(Error(StatusCode::BAD_REQUEST, "mailbox_name_invalid"));
    }
    Ok(())
}
#[utoipa::path(post,path="/api/v1/mailboxes",request_body=MailboxInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn create_mailbox(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<MailboxInput>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    check_name(&input.name)?;
    Ok(Json(
        app.upstream
            .call(
                &me.key,
                "Mailbox/set",
                json!({"accountId":me.account,"create":{"mailbox":{"name":input.name}}}),
            )
            .await?,
    ))
}
#[utoipa::path(patch,path="/api/v1/mailboxes/{id}",params(("id"=String,Path)),request_body=MailboxInput,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn rename_mailbox(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<MailboxInput>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    check_name(&input.name)?;
    let mut update = json!({});
    update[id] = json!({"name":input.name});
    app.upstream
        .call(
            &me.key,
            "Mailbox/set",
            json!({"accountId":me.account,"update":update}),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(delete,path="/api/v1/mailboxes/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn delete_mailbox(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    let result = app
        .upstream
        .call(
            &me.key,
            "Mailbox/get",
            json!({"accountId":me.account,"ids":[id]}),
        )
        .await?;
    let mailbox = result["list"]
        .as_array()
        .and_then(|v| v.first())
        .ok_or(Error(StatusCode::NOT_FOUND, "mailbox_not_found"))?;
    if !mailbox["role"].is_null() || mailbox["totalEmails"].as_u64().unwrap_or(1) != 0 {
        return Err(Error(
            StatusCode::CONFLICT,
            "mailbox_must_be_custom_and_empty",
        ));
    }
    app.upstream
        .call(
            &me.key,
            "Mailbox/set",
            json!({"accountId":me.account,"destroy":[id],"onDestroyRemoveEmails":false}),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize, ToSchema)]
pub(super) struct Batch {
    ids: Vec<String>,
    read: Option<bool>,
    starred: Option<bool>,
    mailbox: Option<String>,
}
#[utoipa::path(post,path="/api/v1/messages/batch",request_body=Batch,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn batch(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Batch>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    if input.ids.is_empty() || input.ids.len() > 100 {
        return Err(Error(StatusCode::BAD_REQUEST, "batch_size_invalid"));
    }
    let mut changes = json!({});
    if let Some(v) = input.read {
        changes["keywords/$seen"] = if v { json!(true) } else { Value::Null };
    }
    if let Some(v) = input.starred {
        changes["keywords/$flagged"] = if v { json!(true) } else { Value::Null };
    }
    if let Some(mailbox) = input.mailbox {
        let mut ids = json!({});
        ids[mailbox] = json!(true);
        changes["mailboxIds"] = ids;
    }
    let mut update = json!({});
    for id in input.ids {
        update[id] = changes.clone();
    }
    Ok(Json(
        app.upstream
            .call(
                &me.key,
                "Email/set",
                json!({"accountId":me.account,"update":update}),
            )
            .await?,
    ))
}
#[derive(Deserialize, Serialize, ToSchema)]
pub(super) struct Attachment {
    blob_id: String,
    name: String,
    #[serde(rename = "type")]
    content_type: String,
}
#[derive(Deserialize, Serialize, ToSchema)]
pub(super) struct Draft {
    id: Option<String>,
    to: Vec<String>,
    cc: Vec<String>,
    bcc: Vec<String>,
    subject: String,
    text: String,
    attachments: Vec<Attachment>,
    in_reply_to: Option<Vec<String>>,
    references: Option<Vec<String>>,
}
fn valid_email(email: &str) -> bool {
    email.len() < 255
        && email.contains('@')
        && !email.chars().any(|c| c.is_whitespace() || c.is_control())
}
async fn draft(app: &App, me: &Identity, input: &Draft) -> Result<String> {
    if input.subject.chars().count() > 998
        || input.text.len() > 1024 * 1024
        || input.to.len() + input.cc.len() + input.bcc.len() > 50
        || input
            .to
            .iter()
            .chain(&input.cc)
            .chain(&input.bcc)
            .any(|e| !valid_email(e))
    {
        return Err(Error(StatusCode::BAD_REQUEST, "message_invalid"));
    }
    let mut attachments = Vec::new();
    let mut total = 0i64;
    for a in &input.attachments {
        let row = db::query(db::Statement::MailDraftSelectUploadOwnership)
            .bind(me.user)
            .bind(&a.blob_id)
            .fetch_optional(&app.db)
            .await?
            .ok_or(Error(StatusCode::FORBIDDEN, "attachment_not_owned"))?;
        total += row.get::<i64, _>("size");
        attachments.push(json!({"blobId":a.blob_id,"name":a.name,"type":row.get::<String,_>("type"),"disposition":"attachment"}));
    }
    let policy = registration::settings(app).await?;
    let limit = policy["attachmentBytes"]
        .as_i64()
        .unwrap_or(20971520)
        .min(20971520);
    if total > limit {
        return Err(Error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "attachments_too_large",
        ));
    }
    let boxes = boxes(app, me).await?;
    let drafts = boxes
        .iter()
        .find(|b| b["role"] == "drafts")
        .and_then(|b| b["id"].as_str())
        .ok_or(Error(StatusCode::BAD_GATEWAY, "draft_mailbox_missing"))?;
    let mut mailbox_ids = json!({});
    mailbox_ids[drafts] = json!(true);
    let address_list =
        |items: &Vec<String>| items.iter().map(|e| json!({"email":e})).collect::<Vec<_>>();
    let mut email = json!({"mailboxIds":mailbox_ids,"keywords":{"$draft":true},"from":[{"email":me.email}],"to":address_list(&input.to),"cc":address_list(&input.cc),"bcc":address_list(&input.bcc),"subject":input.subject,"textBody":[{"partId":"text","type":"text/plain"}],"bodyValues":{"text":{"value":input.text,"isEncodingProblem":false,"isTruncated":false}},"attachments":attachments});
    if let Some(v) = &input.in_reply_to {
        email["inReplyTo"] = json!(v);
    }
    if let Some(v) = &input.references {
        email["references"] = json!(v);
    }
    if let Some(id) = &input.id {
        let submitted: i64 = db::scalar(db::Statement::MailSendDraftSubmissionCount)
            .bind(me.user)
            .bind(id)
            .fetch_one(&app.db)
            .await?;
        if submitted > 0 {
            return Err(Error(StatusCode::CONFLICT, "submission_check_required"));
        }
        let old = app
            .upstream
            .call(
                &me.key,
                "Email/get",
                json!({"accountId":me.account,"ids":[id],"properties":["id","keywords"]}),
            )
            .await?;
        if old["list"][0]["keywords"]["$draft"] != true {
            return Err(Error(StatusCode::CONFLICT, "not_a_draft"));
        }
        // Email bodies are immutable in JMAP. Create the replacement first;
        // remove the old draft only after a successful replacement.
    }
    let result = app
        .upstream
        .call(
            &me.key,
            "Email/set",
            json!({"accountId":me.account,"create":{"draft":email}}),
        )
        .await?;
    let new_id = result["created"]["draft"]["id"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_GATEWAY, "draft_result_unknown"))?
        .to_string();
    if let Some(id) = &input.id {
        app.upstream
            .call(
                &me.key,
                "Email/set",
                json!({"accountId":me.account,"destroy":[id]}),
            )
            .await?;
    }
    Ok(new_id)
}
#[utoipa::path(post,path="/api/v1/drafts",request_body=Draft,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn save_draft(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Draft>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    Ok(Json(json!({"id":draft(&app,&me,&input).await?})))
}
#[utoipa::path(delete,path="/api/v1/drafts/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn delete_draft(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    let old = app
        .upstream
        .call(
            &me.key,
            "Email/get",
            json!({"accountId":me.account,"ids":[id],"properties":["keywords"]}),
        )
        .await?;
    if old["list"][0]["keywords"]["$draft"] != true {
        return Err(Error(StatusCode::CONFLICT, "not_a_draft"));
    }
    app.upstream
        .call(
            &me.key,
            "Email/set",
            json!({"accountId":me.account,"destroy":[id]}),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize, ToSchema)]
pub(super) struct Send {
    idempotency_key: String,
    draft: Draft,
}
#[utoipa::path(post,path="/api/v1/submissions",request_body=Send,responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn send(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Send>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    if input.idempotency_key.len() < 16
        || input.idempotency_key.len() > 100
        || input.draft.to.is_empty()
    {
        return Err(Error(StatusCode::BAD_REQUEST, "submission_invalid"));
    }
    let request_hash =
        hash(&serde_json::to_string(&input.draft).map_err(|_| internal("serialize"))?);
    if let Some(draft_id) = &input.draft.id {
        let existing: i64 = db::scalar(db::Statement::MailSendDraftSubmissionCount)
            .bind(me.user)
            .bind(draft_id)
            .fetch_one(&app.db)
            .await?;
        if existing > 0 {
            return Err(Error(StatusCode::CONFLICT, "submission_check_required"));
        }
    }
    let op = Uuid::new_v4();
    let inserted = db::query(db::Statement::MailSendInsertOperations)
        .bind(op)
        .bind(me.user)
        .bind(&input.idempotency_key)
        .bind(&request_hash)
        .execute(&app.db)
        .await?;
    if inserted.rows_affected() == 0 {
        let old = db::query(db::Statement::MailSendSelectOperations)
            .bind(me.user)
            .bind(&input.idempotency_key)
            .fetch_one(&app.db)
            .await?;
        if old.get::<String, _>("request_hash") != request_hash {
            return Err(Error(StatusCode::CONFLICT, "idempotency_conflict"));
        }
        let result = old
            .get::<Option<String>, _>("result")
            .and_then(|v| serde_json::from_str::<Value>(&v).ok())
            .unwrap_or(json!({}));
        return Ok(Json(
            json!({"operationId":old.get::<Uuid,_>("id"),"status":old.get::<String,_>("status"),"emailId":result["emailId"],"result":result}),
        ));
    }
    let email = match draft(&app, &me, &input.draft).await {
        Ok(id) => id,
        Err(e) => {
            db::query(db::Statement::MailSendUpdateOperations)
                .bind(op)
                .execute(&app.db)
                .await?;
            return Err(e);
        }
    };
    let identities = app
        .upstream
        .call(&me.key, "Identity/get", json!({"accountId":me.account}))
        .await?;
    let sender = identities["list"]
        .as_array()
        .and_then(|v| v.iter().find(|i| i["email"] == me.email))
        .and_then(|i| i["id"].as_str())
        .ok_or(Error(StatusCode::BAD_GATEWAY, "sender_identity_missing"))?;
    // Persist the email id before submission. Any ambiguous result is reconciled
    // against EmailSubmission/query, never automatically resubmitted.
    db::query(db::Statement::MailSendUpdateOperations2)
        .bind(json!({"emailId":email}).to_string())
        .bind(op)
        .execute(&app.db)
        .await?;
    let boxes = boxes(&app, &me).await?;
    let sent = boxes
        .iter()
        .find(|b| b["role"] == "sent")
        .and_then(|b| b["id"].as_str())
        .ok_or(Error(StatusCode::BAD_GATEWAY, "sent_mailbox_missing"))?;
    let mut mailboxes = json!({});
    mailboxes[sent] = json!(true);
    let result=app.upstream.call(&me.key,"EmailSubmission/set",json!({"accountId":me.account,"create":{"send":{"emailId":email,"identityId":sender}},"onSuccessUpdateEmail":{"#send":{"keywords/$draft":null,"mailboxIds":mailboxes}}})).await;
    match result {
        Ok(result) => {
            let submitted = result["created"]["send"]["id"]
                .as_str()
                .ok_or(Error(StatusCode::BAD_GATEWAY, "submission_result_unknown"))?;
            db::query(db::Statement::MailSendUpdateOperations3)
                .bind(json!({"emailId":email,"submissionId":submitted}).to_string())
                .bind(op)
                .execute(&app.db)
                .await?;
            Ok(Json(
                json!({"operationId":op,"status":"submitted","submissionId":submitted}),
            ))
        }
        Err(error) => {
            let status = if matches!(error, stalwart::UpstreamError::ObjectRejected) {
                "failed"
            } else {
                "unknown"
            };
            db::query(db::Statement::MailSendUpdateOperations4)
                .bind(status)
                .bind(op)
                .execute(&app.db)
                .await?;
            Ok(Json(
                json!({"operationId":op,"status":status,"emailId":email}),
            ))
        }
    }
}
#[utoipa::path(get,path="/api/v1/submissions/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn submission_status(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let me = identity(&app, &headers, false).await?;
    let app = connections::for_user(&app, me.user).await?;
    let row = db::query(db::Statement::MailSubmissionStatusSelectOperations)
        .bind(id)
        .bind(me.user)
        .fetch_optional(&app.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "operation_not_found"))?;
    let result = row
        .get::<Option<String>, _>("result")
        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
        .unwrap_or(json!({}));
    let mut status = row.get::<String, _>("status");
    let mut delivery = Value::Null;
    if let Some(email) = result["emailId"].as_str() {
        let found = app
            .upstream
            .call(
                &me.key,
                "EmailSubmission/query",
                json!({"accountId":me.account,"filter":{"emailIds":[email]}}),
            )
            .await?;
        if found["ids"].as_array().is_some_and(|v| !v.is_empty()) {
            let found = app
                .upstream
                .call(
                    &me.key,
                    "EmailSubmission/get",
                    json!({"accountId":me.account,"ids":found["ids"]}),
                )
                .await?;
            delivery = found["list"].clone();
            status = "submitted".into();
            db::query(db::Statement::MailSubmissionStatusUpdateOperations)
                .bind(id)
                .execute(&app.db)
                .await?;
        }
    }
    Ok(Json(
        json!({"operationId":id,"status":status,"delivery":delivery}),
    ))
}
fn template(url: &str, account: &str, blob: &str, name: &str, kind: &str) -> String {
    url.replace("{accountId}", &urlencoding::encode(account))
        .replace("{blobId}", &urlencoding::encode(blob))
        .replace("{name}", &urlencoding::encode(name))
        .replace("{type}", &urlencoding::encode(kind))
}
fn checked_url(app: &App, url: &str) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(url)
        .map_err(|_| Error(StatusCode::BAD_GATEWAY, "resource_url_invalid"))?;
    let base = reqwest::Url::parse(&app.upstream.base).map_err(|_| internal("base_url"))?;
    if url.origin() != base.origin() {
        return Err(Error(StatusCode::BAD_GATEWAY, "resource_origin_invalid"));
    }
    Ok(url)
}
#[derive(Serialize, ToSchema)]
pub(super) struct UploadView {
    #[serde(rename = "blobId")]
    blob_id: String,
    name: String,
    #[serde(rename = "type")]
    content_type: String,
    size: usize,
}
#[utoipa::path(post,path="/api/v1/attachments",responses((status=200,body=UploadView),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn upload(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    mut form: Multipart,
) -> Result<Json<UploadView>> {
    let me = identity(&app, &headers, true).await?;
    let app = connections::for_user(&app, me.user).await?;
    let metadata = app.upstream.session(&me.key).await?;
    let target = metadata["uploadUrl"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_GATEWAY, "upload_not_supported"))?;
    let url = checked_url(&app, &template(target, &me.account, "", "", ""))?;
    let Some(mut field) = form
        .next_field()
        .await
        .map_err(|_| Error(StatusCode::BAD_REQUEST, "multipart_invalid"))?
    else {
        return Err(Error(StatusCode::BAD_REQUEST, "file_required"));
    };
    let name = field.file_name().unwrap_or("attachment").to_string();
    let kind = field
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();
    if name.len() > 255 {
        return Err(Error(StatusCode::BAD_REQUEST, "filename_too_long"));
    }
    // Bounded disk staging allows a hard limit before the upstream upload. The
    // request is never accumulated as an attachment-sized in-memory buffer.
    let root = std::env::var("STAGING_DIR").unwrap_or_else(|_| "data/staging".into());
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|_| internal("staging"))?;
    let path = std::path::Path::new(&root).join(Uuid::new_v4().to_string());
    let mut file = tokio::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .await
        .map_err(|_| internal("staging"))?;
    let mut size = 0usize;
    use tokio::io::AsyncWriteExt;
    let result: Result<UploadView> = async {
        while let Some(chunk) = field
            .chunk()
            .await
            .map_err(|_| Error(StatusCode::BAD_REQUEST, "upload_interrupted"))?
        {
            size += chunk.len();
            if size > 20 * 1024 * 1024 {
                return Err(Error(StatusCode::PAYLOAD_TOO_LARGE, "attachment_too_large"));
            }
            file.write_all(&chunk)
                .await
                .map_err(|_| internal("staging"))?;
        }
        file.flush().await.map_err(|_| internal("staging"))?;
        drop(file);
        let read = tokio::fs::File::open(&path)
            .await
            .map_err(|_| internal("staging"))?;
        let response = app
            .upstream
            .http
            .post(url)
            .bearer_auth(&me.key)
            .header("content-type", &kind)
            .body(reqwest::Body::wrap_stream(
                tokio_util::io::ReaderStream::new(read),
            ))
            .send()
            .await
            .map_err(|_| Error(StatusCode::BAD_GATEWAY, "upload_failed"))?;
        if !response.status().is_success() {
            return Err(Error(StatusCode::BAD_GATEWAY, "upload_failed"));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|_| Error(StatusCode::BAD_GATEWAY, "upload_failed"))?;
        let blob = value["blobId"]
            .as_str()
            .ok_or(Error(StatusCode::BAD_GATEWAY, "upload_result_invalid"))?;
        db::query(db::Statement::MailUploadInsertUploadOwnership)
            .bind(me.user)
            .bind(blob)
            .bind(size as i64)
            .bind(&kind)
            .bind(db::now())
            .execute(&app.db)
            .await?;
        Ok(UploadView {
            blob_id: blob.to_string(),
            name,
            content_type: kind,
            size,
        })
    }
    .await;
    let _ = tokio::fs::remove_file(path).await;
    Ok(Json(result?))
}
#[utoipa::path(get,path="/api/v1/attachments/{id}",params(("id"=String,Path)),responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn download(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Result<Response> {
    let me = identity(&app, &headers, false).await?;
    let app = connections::for_user(&app, me.user).await?;
    let message = q
        .get("message")
        .ok_or(Error(StatusCode::BAD_REQUEST, "message_required"))?;
    let owned = app
        .upstream
        .call(
            &me.key,
            "Email/get",
            json!({"accountId":me.account,"ids":[message],"properties":["attachments"]}),
        )
        .await?;
    let part = owned["list"][0]["attachments"]
        .as_array()
        .and_then(|v| v.iter().find(|a| a["blobId"] == id))
        .ok_or(Error(StatusCode::NOT_FOUND, "attachment_not_found"))?;
    let kind = part["type"].as_str().unwrap_or("application/octet-stream");
    let name = part["name"].as_str().unwrap_or("attachment");
    let metadata = app.upstream.session(&me.key).await?;
    let target = metadata["downloadUrl"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_GATEWAY, "download_not_supported"))?;
    let url = checked_url(&app, &template(target, &me.account, &id, name, kind))?;
    let response = app
        .upstream
        .http
        .get(url)
        .bearer_auth(&me.key)
        .send()
        .await
        .map_err(|_| Error(StatusCode::BAD_GATEWAY, "download_failed"))?;
    if !response.status().is_success() {
        return Err(Error(StatusCode::NOT_FOUND, "attachment_not_found"));
    }
    let preview = q.get("preview").is_some_and(|s| s == "true")
        && matches!(
            kind,
            "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "image/gif"
        );
    let mut result = Body::from_stream(response.bytes_stream()).into_response();
    result.headers_mut().insert(
        "content-type",
        HeaderValue::from_str(if preview {
            kind
        } else {
            "application/octet-stream"
        })
        .map_err(|_| internal("header"))?,
    );
    result.headers_mut().insert(
        "content-disposition",
        HeaderValue::from_str(&format!(
            "{}; filename*=UTF-8''{}",
            if preview { "inline" } else { "attachment" },
            urlencoding::encode(name)
        ))
        .map_err(|_| internal("header"))?,
    );
    result.headers_mut().insert(
        "content-security-policy",
        HeaderValue::from_static(
            "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        ),
    );
    result.headers_mut().insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    result
        .headers_mut()
        .insert("cache-control", HeaderValue::from_static("no-store"));
    Ok(result)
}
#[utoipa::path(get,path="/api/v1/events",responses((status=200,body=Value),(status=204,description="Completed"),(status=401,description="Session required"),(status=403,description="Denied")))]
pub(super) async fn events(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Response> {
    let me = identify(&app, &headers, false, false).await?;
    let app = connections::for_user(&app, me.user).await?;
    let metadata = app.upstream.session(&me.key).await?;
    let target = metadata["eventSourceUrl"]
        .as_str()
        .ok_or(Error(StatusCode::BAD_GATEWAY, "events_not_supported"))?;
    let target = target
        .replace("{types}", "Email,Mailbox,EmailSubmission")
        .replace("{closeafter}", "no")
        .replace("{ping}", "30");
    let url = checked_url(&app, &target)?;
    // Events invalidate cached results; a reconnect always triggers a query.
    let stream = async_stream::stream! {
        yield Ok::<Event,std::convert::Infallible>(Event::default().event("sync").data("{}"));
        let client=reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build();
        if let Ok(client)=client && let Ok(response)=client.get(url).bearer_auth(&me.key).send().await && response.status().is_success(){let mut chunks=response.bytes_stream();loop{
            let chunk=tokio::time::timeout(std::time::Duration::from_secs(45),chunks.next()).await;
            let active:bool=db::scalar(db::Statement::MailEventsSelectSessions).bind(&me.session).bind(db::now()).bind(db::now()-1800000).fetch_one(&app.db).await.unwrap_or(false);
            if !active{yield Ok(Event::default().event("session-expired").data("{}"));break;}
            match chunk{Ok(Some(Ok(_)))=>yield Ok(Event::default().event("sync").data("{}")),_=>break}
        }}
    };
    Ok(
        Sse::new(stream.take_until(SHUTDOWN.clone().cancelled_owned()))
            .keep_alive(KeepAlive::default())
            .into_response(),
    )
}

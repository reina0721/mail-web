export class ApiError extends Error { constructor(public status:number,public code:string){super(code);} }
export function csrfToken(){return document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith((location.protocol==='https:'?'__Host-mail_csrf':'mail_csrf')+'='))?.split('=')[1];}
export function errorMessage(error:unknown):string {
 if(!(error instanceof ApiError))return '连接失败，请稍后重试';
 const messages:Record<string,string>={submission_check_required:'这份草稿已有提交记录，请先检查发送结果',address_unavailable:'邮箱名称已被使用，请选择其他名称',upstream_address_exists:'邮箱名称已被使用，请选择其他名称',registration_closed:'公开注册尚未开放',registration_full:'可申请的邮箱名额已满',registration_input_invalid:'请检查邮箱名称及密码格式',registration_conflict:'请继续原来的邮箱申请，或重新验证外部邮箱',registration_in_progress_retry_later:'开户正在处理，请稍后使用相同名称和密码重试',provisioning_result_unknown:'开户结果待核对，请稍后使用相同名称和密码重试',recovery_email_invalid:'请填写有效的外部邮箱地址',password_invalid:'密码需要 12–128 个字符',code_invalid:'验证码不正确，请重新输入',challenge_expired:'验证码已失效，请重新验证外部邮箱',challenge_already_used:'验证记录已使用，请重新验证外部邮箱',verification_required:'请重新验证外部邮箱',captcha_invalid:'人机验证已失效，请重新完成验证',attachment_not_owned:'无法使用此附件，请重新上传',attachments_too_large:'附件合计不能超过 20MiB',attachment_too_large:'附件不能超过 20MiB',message_invalid:'请检查收件地址、主题和附件',not_a_draft:'这份草稿已变更，请返回草稿箱重新打开',idempotency_conflict:'提交内容已经变更，请先核对上次发送结果'};
 Object.assign(messages,{setup_required:'请先完成站点配置',setup_token_invalid:'安装管理令牌无效，请在安装目录重新获取',site_configuration_invalid:'请检查站点名称和邮箱域名',public_origin_invalid:'访问地址无效；公网 HTTP 需要在安装时显式启用',stalwart_url_invalid:'请填写有效的 Stalwart HTTPS 来源，不包含路径或登录信息',provisioning_key_required:'请填写专用目录服务 API 密钥',configured_domain_missing:'Stalwart 中未找到这个域名，请核对配置',domain_id_mismatch:'域名 ID 与 Stalwart 返回的结果不一致',domain_has_accounts:'已有邮箱账号，不能直接更换域名',ordinary_mailbox_required:'请选择该域名下的普通邮箱，不使用 Stalwart 管理员账号',operator_identity_invalid:'请检查运营邮箱、密码和外部恢复邮箱',operator_already_initialized:'运营身份已初始化，请使用已有账号登录',mail_account_required:'该身份没有可用的个人邮箱',mail_service_unavailable:'无法连接邮件服务，请检查地址、API 密钥及权限'});
 Object.assign(messages,{new_server_key_required:'更换 Stalwart 来源后，请重新提供该服务器的目录服务 API 密钥'});
 Object.assign(messages,{initialization_callback_unreachable:'新回调认证或策略同步未通过，未启用新 Hook；已有配置可恢复后重试',initialization_permissions_missing:'管理员权限不完整，请根据授权结果补齐后重新授权',administrator_authentication_failed:'管理员认证失败；请核对账号密码，启用双重验证时使用管理员 API 密钥',administrator_credentials_required:'请填写 Stalwart 管理员账号密码或 API 密钥',initialization_authorization_expired:'临时授权已过期，请重新输入管理员凭据后继续',initialization_resume_original_plan:'请继续原来的初始化计划；已有资源不会被覆盖',initialization_resource_conflict:'检测到不属于本安装的同名资源，请核对后重试',initialization_hook_result_ambiguous:'Hook 创建结果无法确认，已停止操作以免影响其他应用',initialization_create_rejected:'Stalwart 拒绝创建资源，请检查管理员权限和当前步骤',initialization_server_migration_required:'已有账号的服务器迁移需要专门流程，不能通过初始化覆盖',cloudflare_permission_denied:'Cloudflare Token 权限不足，需要目标账号的 Turnstile 写入权限',cloudflare_account_and_token_required:'请填写目标 Cloudflare Account ID，并重新提供 API Token',cloudflare_rate_limited:'Cloudflare 请求达到频率限制，请稍后重新授权继续',cloudflare_unavailable:'无法连接 Cloudflare，已保留其他步骤',turnstile_secret_unavailable:'Widget 已存在但未取得 Secret；没有自动轮换其他密钥',operator_address_exists:'运营邮箱名称已存在，请使用绑定已有邮箱方式',initialization_reauthorize_to_resume:'任务被中断，请重新授权后继续',initialization_cancelled:'已停止后续步骤，已创建资源保留'});
 Object.assign(messages,{readiness_link_expired:'检查链接已过期或已使用，请回配置面板生成新链接',readiness_configuration_changed:'运行配置已变化，请重新检查并生成链接',readiness_automatic_checks_failed:'请先修复自动检查未通过的项目',readiness_attempts_exhausted:'验证码尝试次数已用完，请回配置面板生成新链接',readiness_mail_already_sent:'该检查链接已发送验证码，请输入收到的验证码',registration_dependencies_missing:'注册条件尚未满足，请查看条件清单'});
 return messages[error.code]??(error.status===429?'请求较频繁，请稍后重试':error.status===401?'登录已过期，请重新登录':error.status===403?'当前账号没有执行此操作的权限':'操作暂未完成，请稍后重试');
}
export async function api<T>(path:string,init:RequestInit={}):Promise<T> {
 const headers=new Headers(init.headers);
 if(init.body && !(init.body instanceof FormData)) headers.set('Content-Type','application/json');
 if(init.method && init.method!=='GET') {
  const csrf=csrfToken();
  if(csrf) headers.set('X-CSRF-Token',csrf);
 }
 const response=await fetch('/api/v1'+path,{...init,headers,credentials:'same-origin',cache:'no-store'});
 if(!response.ok){const error=await response.json().catch(()=>({code:'unavailable'}));throw new ApiError(response.status,error.code);}
 return response.status===204?undefined as T:response.json();
}

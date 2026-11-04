export class ApiError extends Error { constructor(public status:number,public code:string){super(code);} }
export function csrfToken(){return document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith('__Host-mail_csrf='))?.split('=')[1];}
export function errorMessage(error:unknown):string {
 if(!(error instanceof ApiError))return '连接失败，请稍后重试';
 const messages:Record<string,string>={submission_check_required:'这份草稿已有提交记录，请先检查发送结果',address_unavailable:'邮箱名称已被使用，请选择其他名称',upstream_address_exists:'邮箱名称已被使用，请选择其他名称',registration_closed:'公开注册尚未开放',registration_full:'可申请的邮箱名额已满',registration_input_invalid:'请检查邮箱名称及密码格式',registration_conflict:'请继续原来的邮箱申请，或重新验证外部邮箱',registration_in_progress_retry_later:'开户正在处理，请稍后使用相同名称和密码重试',provisioning_result_unknown:'开户结果待核对，请稍后使用相同名称和密码重试',recovery_email_invalid:'请填写有效的外部邮箱地址',password_invalid:'密码需要 12–128 个字符',code_invalid:'验证码不正确，请重新输入',challenge_expired:'验证码已失效，请重新验证外部邮箱',challenge_already_used:'验证记录已使用，请重新验证外部邮箱',verification_required:'请重新验证外部邮箱',captcha_invalid:'人机验证已失效，请重新完成验证',attachment_not_owned:'无法使用此附件，请重新上传',attachments_too_large:'附件合计不能超过 20MiB',attachment_too_large:'附件不能超过 20MiB',message_invalid:'请检查收件地址、主题和附件',not_a_draft:'这份草稿已变更，请返回草稿箱重新打开',idempotency_conflict:'提交内容已经变更，请先核对上次发送结果'};
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

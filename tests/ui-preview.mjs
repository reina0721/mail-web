// Isolated UI fixture server. No credentials, upstream requests, or persistent writes.
// Run after the frontend build: node tests/ui-preview.mjs
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../frontend/apps/web/out/',import.meta.url));
const port=Number(process.env.MAIL_UI_PREVIEW_PORT??4201);
const policy={enabled:false,maximumAccounts:100,quotaBytes:1073741824,attachmentBytes:20971520,hourlyRecipients:20,dailyRecipients:100};
const users=['operator','lin','design','team','archive','support'].map((name,i)=>({id:name,email:name+'@example.com',status:i===4?'disabled':'active',operator:i===0,quotaBytes:1073741824,hourlyRecipients:20,dailyRecipients:100}));
const subjects=['十一月项目安排，请查收','设计评审 · 收件箱体验优化','本周会议纪要与待办','你的账号安全提醒','新版本更新说明','Re: 关于下周的协作安排','资料整理完成','欢迎使用 Mail Web'];
const senders=['林予安','设计协作','陈一舟','账号安全团队','产品更新','周晓','项目资料','项目团队'];
const messages=Array.from({length:54},(_,i)=>({id:String(i+1),subject:subjects[i%8]+(i>7?` · ${Math.floor(i/8)+1}`:''),preview:['你好，十一月的项目安排已经整理好了，附件中是详细计划。','我们整理了今天的评审反馈，一起让沟通更顺畅。','感谢大家参加会议，以下是今天的讨论要点与后续安排。','请定期检查你的登录设备，保护邮箱安全。'][i%4],from:[{name:senders[i%8],email:['lin','design','chen','security'][i%4]+'@example.com'}],to:[{name:'运营团队',email:'operator@example.com'}],cc:[],bcc:[],keywords:i%3===1?{$flagged:true}:i%3===2?{$seen:true}:{},receivedAt:new Date(Date.UTC(2026,10,4,14,30)-i*3600000).toISOString(),mailbox:'inbox'}));
const boxes=['inbox','sent','drafts','archive','junk','trash'].map(role=>({id:role,name:role,role,unreadEmails:role==='inbox'?8:0}));
boxes.push({id:'projects',name:'项目协作',role:null,unreadEmails:0});
const audit=[{id:'a1',actorId:'operator',subjectId:'lin',action:'account.update',outcome:'success',createdAt:1793797200000},{id:'a2',actorId:'operator',subjectId:null,action:'registration.update',outcome:'success',createdAt:1793793600000},{id:'a3',actorId:'operator',subjectId:null,action:'task.retry',outcome:'queued',createdAt:1793790000000}];
const mode={expired:false,operator:true,fail:'',slow:false,theme:'light',ready:false,setupConfigured:true,setupNeedsOperator:false,setupEpoch:0};
const setupDocs='https://github.com/reina0721/mail-web/blob/main/docs/stalwart-setup.md';
let setup={brand:'Mail Web',domain:'example.com',publicOrigin:'https://webmail.example.com',stalwartUrl:'https://mail.example.com',domainId:'preview-domain',notificationAccount:'',notificationEmail:'',hookId:'',turnstileSiteKey:''};
const log=[];
let initializationJob=null,initializationGrant='',initializationPolls=0,initializationBase='';
const secondaryId='e48cbb48-75a8-42de-bcd5-c5c1272f0def',secondaryDomain='4bc36eaf-cd4a-4bf2-b170-32bec85be85e';
const services=[{id:'default',name:'默认邮件服务',origin:'https://mail.example.com',configured:true},{id:secondaryId,name:'团队邮件服务',origin:'https://mail.team.example',configured:true}];
const bindings=[{id:'default',serviceId:'default',name:'example.com',upstreamId:'preview-domain',serviceName:'默认邮件服务'},{id:secondaryDomain,serviceId:secondaryId,name:'team.example',upstreamId:'preview-team',serviceName:'团队邮件服务'}];
const policies=new Map([['default',policy],[secondaryDomain,{...policy}]]),connectionJobs=new Map();
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let s='';for await(const c of req)s+=c;return s?JSON.parse(s):{};}
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(p==='/__preview/control'&&req.method==='POST'){Object.assign(mode,await body(req));return json(res,mode);}
 if(p==='/__preview/log')return json(res,log);
 if(p.startsWith('/api/v1/')){
  const key=p.slice(7),input=req.method==='GET'?{}:await body(req);log.push({method:req.method,path:key,input:Object.fromEntries(Object.entries(input).map(([k,v])=>[k,/password|secret|token|apiKey|ticket|provisioningKey|notificationKey/i.test(k)?'[redacted]':v]))});
  const domainId=url.searchParams.get('domainId')??'default',serviceId=url.searchParams.get('serviceId')??'default',domainPolicy=policies.get(domainId)??policy;
  if(key==='/installation/connections'){
   if(req.method==='POST'){const source=services.find(s=>s.id===input.id);if(source)Object.assign(source,{name:input.name});for(const name of input.domains??[]){if(!bindings.some(d=>d.name===name)){const id='preview-'+bindings.length;bindings.push({id,serviceId:input.id,name,upstreamId:'preview-remote',serviceName:input.name});policies.set(id,{...policy,enabled:false});}}}
   return json(res,{services,domains:bindings});
  }
  if(key==='/installation/connections/prepare'){services.push({id:input.id,name:input.name,origin:input.origin,configured:false});return json(res,{serviceId:input.id});}
  if(key.startsWith('/installation/connections/'))return json(res,{settings:{notification_account:'preview-sender',notification_email:'verification@team.example',hook_id:'preview-hook'},provisioningKeySet:true,notificationKeySet:true,hookSecretSet:true});
  if(key==='/installation/initialize/job'&&serviceId!=='default'){
   if(req.method==='POST'){connectionJobs.set(serviceId,{status:'completed',step:'completed',spec:input.spec,resources:{domain:'preview-remote',directory:'preview-service',directoryKey:'preview-key',notification:'preview-sender',notificationKey:'preview-key',hook:'preview-hook'}});const service=services.find(s=>s.id===serviceId);service.configured=true;if(!bindings.some(d=>d.name===input.spec.domain)){const id='preview-'+bindings.length;bindings.push({id,serviceId,name:input.spec.domain,upstreamId:'preview-remote',serviceName:service.name});policies.set(id,{...policy,enabled:false});}}
   return json(res,{job:connectionJobs.get(serviceId)??null});
  }
  if(key==='/installation')return json(res,{configured:mode.setupConfigured,needsOperator:mode.setupNeedsOperator,brand:setup.brand,domain:mode.setupConfigured?setup.domain:'',version:'preview',instanceId:'isolated-preview-'+mode.setupEpoch});
  if(key==='/registration/domains')return json(res,{items:bindings.map(d=>({id:d.id,domain:d.name,enabled:policies.get(d.id)?.enabled,dependenciesReady:!!mode.readinessHuman}))});
  if(key==='/registration/policy')return json(res,{...domainPolicy,brand:setup.brand,siteKey:'',domain:bindings.find(d=>d.id===domainId)?.name??'example.com'});
  if(mode.expired)return json(res,{code:'unauthorized'},401);
  if(mode.fail&&key.startsWith(mode.fail))return json(res,{code:'unavailable'},503);
  if(key==='/installation/readiness'){
   if(mode.slow&&req.method==='POST')await new Promise(resolve=>setTimeout(resolve,1200));
   const labels={configuration:'运行凭据和网站来源',directory:'目录服务与账号管理权限',domain:'已配置的邮箱域名',sender:'发件权限与真实发件身份',hook:'专用 Hook 配置与账号作用范围',callback:'网站回调认证（不代表协议实测）',turnstile:'Turnstile 配置（真实验证在下一步）'};
   const items=Object.entries(labels).map(([id,label])=>({id,label,status:mode.readinessFailure===id?'failed':'passed',reason:mode.readinessFailure===id?'callback_unreachable':null}));
   const ready=!mode.readinessFailure&&!!mode.readinessHuman;
   return json(res,{ready,items,serviceId:bindings.find(d=>d.id===domainId)?.serviceId??'default',domainId,requestedEnabled:domainPolicy.enabled,effectiveEnabled:domainPolicy.enabled&&ready,checkedAt:Date.now(),humanVerifiedAt:mode.readinessHuman?Date.now():0,releaseVersion:'0.3.0-alpha.1',protocolScope:'示例预览：未执行真实服务验收'});
  }
  if(key==='/installation/readiness/link')return json(res,{url:setup.publicOrigin+'/setup/check/#check=isolated-preview-only',expiresInSeconds:600});
  if(key==='/installation/initialize/authorize'){
   if(input.username==='denied')return json(res,{code:'initialization_permissions_missing'},403);
   if(mode.slow)await new Promise(resolve=>setTimeout(resolve,1200));
   initializationGrant='example-memory-only-ticket';initializationBase=input.base;
   return json(res,{ticket:initializationGrant,domains:[{id:'preview-domain',name:'example.com'},{id:'preview-other',name:'other.example'}],cloudflareAccounts:input.cloudflareToken?[{id:'0123456789abcdef0123456789abcdef',name:'示例 Cloudflare 账号'}]:[],missingPermissions:[],expiresInSeconds:600});
  }
  if(key==='/installation/initialize/preflight'){
   if(input.ticket!==initializationGrant||!initializationGrant)return json(res,{code:'initialization_authorization_expired'},401);
   return json(res,{resources:['邮箱域名（已有则复用）','本安装专用目录服务身份与 API 密钥','验证码发件邮箱与 API 密钥','本安装专用 MTA Hook 与共享密钥','运营邮箱及策略作用范围'],turnstile:!!input.spec.cloudflareAccount});
  }
  if(key==='/installation/initialize/job'){
   if(req.method==='POST'){if(input.ticket!==initializationGrant||!initializationGrant)return json(res,{code:'initialization_authorization_expired'},401);initializationJob={id:'isolated-initialization',base:initializationBase,spec:input.spec,status:'running',step:'domain',resources:{},completed:[],error:''};initializationPolls=0;}
   else if(initializationJob?.status==='running'){
    const stages=['domain','directory','notification','hook','turnstile','operator','scope','verify','apply'];
    initializationJob.step=stages[Math.min(initializationPolls,stages.length-1)];initializationJob.completed=stages.slice(0,initializationPolls++);
    initializationJob.resources={domain:'preview-domain',directory:'preview-directory',notification:'preview-sender',hook:'preview-hook',...(initializationJob.spec.cloudflareAccount?{turnstile:'preview-sitekey'}:{})};
    if(initializationPolls>stages.length){initializationJob.status='completed';setup={...setup,...initializationJob.spec,stalwartUrl:initializationBase};mode.setupConfigured=true;mode.setupNeedsOperator=false;mode.setupEpoch++;initializationGrant='';}
   }
   return json(res,{job:initializationJob});
  }
  if(key==='/installation/initialize/cancel'){initializationGrant='';if(initializationJob?.status==='running')initializationJob.status='cancelled';return json(res,{cancelRequested:true,resourcesDeleted:false});}
  if(key==='/installation/config'&&req.method==='GET')return json(res,{settings:mode.setupConfigured?setup:{brand:'Mail Web',domain:'',publicOrigin:'',stalwartUrl:'',domainId:'',notificationAccount:'',notificationEmail:'',hookId:'',turnstileSiteKey:''},provisioningKeySet:mode.setupConfigured,notificationKeySet:false,hookSecretSet:false,turnstileSecretSet:false,policyVerified:false,missingRequirements:['验证邮件账号','验证邮件密钥','Turnstile Site Key','Turnstile Secret','本部署专用 MTA Hook','Hook 共享密钥','SMTP／JMAP 提交协议验收声明'],documentationUrl:setupDocs});
  if(key==='/installation/config'){setup=Object.fromEntries(Object.entries(input).filter(([k])=>!['provisioningKey','notificationKey','hookSecret','turnstileSecret'].includes(k)));mode.setupConfigured=true;mode.setupEpoch++;return json(res,{saved:true,restartRequired:true});}
  if(key==='/installation/operator'){mode.setupNeedsOperator=false;return json(res,{});}
  if(key==='/installation/discover'){
   if(mode.slow)await new Promise(resolve=>setTimeout(resolve,input.domain==='other.example.com'?100:1200));
   const base=input.stalwartUrl,domain=input.domain,callback=input.publicOrigin?.replace(/\/$/,'')+'/internal/mta-hook';
   return json(res,{stalwartUrl:base,documentationUrl:setupDocs,persisted:false,domains:[{id:'preview-domain',name:'example.com'},{id:'preview-other',name:'other.example.com'}],accounts:domain?[{id:'preview-sender-'+domain,name:'verification',email:'verification@'+domain}]:[],hooks:[{id:'preview-hook',url:callback,matchesDeployment:true},{id:'other-app-hook',url:'https://unrelated.example.com/internal/mta-hook',matchesDeployment:false}],links:{admin:base+'/admin/',account:base+'/account/',domains:base+'/admin/Management/x:Domain',accounts:base+'/admin/Management/x:Account/User',hooks:base+'/admin/Settings/x:MtaHook',keys:base+'/account/Account/x:ApiKey'},sections:{domains:'ready',accounts:domain?'ready':'select_domain',hooks:mode.setupHookDenied?'permission_denied':'ready'},callbackUrl:callback});
  }
  if(key==='/auth/session')return json(res,{id:'operator',email:'operator@example.com',operator:mode.operator});
  if(key==='/auth/logout'){mode.expired=true;return json(res,{});}
  if(key==='/account'){if(req.method==='PATCH'){if(input.display_name!==undefined)mode.profileName=input.display_name;if(input.theme!==undefined)mode.theme=input.theme;}return json(res,{email:'operator@example.com',displayName:mode.profileName??'运营团队',quotaBytes:1073741824,usedBytes:104857600,preferences:{theme:mode.theme}});}
  if(key==='/account/usage')return json(res,{usedBytes:104857600,quotaBytes:1073741824});
  if(key==='/account/capabilities')return json(res,{changePassword:true,appPasswords:true});
  if(key==='/auth/sessions')return json(res,{items:[{id:'preview-current',current:true,lastSeen:Date.now()},{id:'preview-other',current:false,lastSeen:Date.now()-60000}]});
  if(key.startsWith('/auth/sessions/'))return json(res,{});
  if(key==='/account/app-passwords')return json(res,req.method==='POST'?{created:{credential:{secret:'preview-only-not-a-real-password'}}}:{list:[]});
  if(key==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': preview\n\n');return;}
  if(key==='/mailboxes'&&req.method==='GET')return json(res,{list:boxes});
  if(key==='/mailboxes'){boxes.push({id:'custom-'+boxes.length,name:input.name,role:null,unreadEmails:0});return json(res,{});}
  if(key.startsWith('/mailboxes/')){const id=decodeURIComponent(key.split('/').pop());if(req.method==='DELETE')boxes.splice(boxes.findIndex(b=>b.id===id),1);else Object.assign(boxes.find(b=>b.id===id),{name:input.name});return json(res,{});}
  if(key==='/messages'){const list=messages.filter(m=>m.mailbox===(url.searchParams.get('mailbox')??'inbox')&&(m.subject+m.preview).includes(url.searchParams.get('search')??''));const offset=Number(url.searchParams.get('position')??0);return json(res,{items:list.slice(offset,offset+50),total:list.length});}
  if(key==='/messages/batch'){for(const id of input.ids??[]){const m=messages.find(m=>m.id===id);if(!m)continue;if('read'in input)m.keywords.$seen=input.read;if('starred'in input)m.keywords.$flagged=input.starred;if(input.mailbox)m.mailbox=input.mailbox;}return json(res,{});}
  if(key.startsWith('/messages/')){const m=messages.find(m=>m.id===decodeURIComponent(key.split('/').pop()));if(!m)return json(res,{code:'not_found'},404);if(req.method==='PATCH'){if('read'in input)m.keywords.$seen=input.read;return json(res,{});}if(mode.slow)await new Promise(r=>setTimeout(r,m.id==='1'?1200:100));return json(res,{...m,textBody:[{partId:'text'}],bodyValues:{text:{value:'你好，\n\n十一月的项目安排已经整理完成，发给大家确认。\n\n本月我们会重点推进邮件体验的改进，包括收件箱整理、团队协作和账号管理。详细的时间安排和分工已放在附件中，请查收。\n\n如果你对安排有任何建议，直接回复这封邮件就好。我们会在周五的例会上一起确认。\n\n谢谢，期待一起把事情做好。\n\n林予安\n项目协作团队'}},messageId:['preview-'+m.id],references:[],attachments:m.id==='1'?[{blobId:'plan',name:'十一月项目计划.pdf',type:'application/pdf',size:245760}]:[]});}
  if(key==='/drafts')return json(res,{id:'preview-draft'});
  if(key==='/submissions')return json(res,{operationId:'preview-operation',status:'submitted'});
  if(key.startsWith('/submissions/'))return json(res,{status:'submitted'});
  if(key.startsWith('/admin/')&&!mode.operator)return json(res,{code:'forbidden'},403);
  if(key==='/admin/users')return json(res,{items:users});
  if(key.startsWith('/admin/users/')){Object.assign(users.find(u=>u.id===key.split('/').pop()),{quotaBytes:input.quota_bytes,hourlyRecipients:input.hourly_recipients,dailyRecipients:input.daily_recipients,status:input.enabled?'active':'disabled'});return json(res,{});}
  if(key==='/admin/registration'){if(req.method==='PATCH')Object.assign(domainPolicy,input);return json(res,{policy:domainPolicy,dependenciesReady:!mode.readinessFailure&&!!mode.readinessHuman});}
  if(key==='/admin/tasks')return json(res,{accountPolicyJobs:0,credentialRevocations:0,registrationReconciliation:0});
  if(key==='/admin/tasks/retry')return json(res,{queued:0});
  if(key==='/admin/audit')return json(res,{items:audit});
  return json(res,{code:'not_found'},404);
 }
 let file=path.resolve(root,'.'+decodeURIComponent(p));if(path.relative(root,file).startsWith('..'))return json(res,{},404);
 if((await stat(file)).isDirectory())file=path.join(file,'index.html');
 const ext=path.extname(file);let data=await readFile(file);
 if(ext==='.html')data=Buffer.from(data.toString().replace('</body>','<div style="position:fixed;bottom:6px;right:10px;z-index:100;font:10px system-ui;color:CanvasText;background:Canvas;padding:3px 7px;border:1px solid GrayText;border-radius:4px;pointer-events:none">示例预览 · 非真实账号</div></body>'));
 res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.txt':'text/plain','.svg':'image/svg+xml','.woff2':'font/woff2'})[ext]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(e){json(res,{code:'preview_error'},500);}
}).listen(port,'127.0.0.1',()=>console.log(`Isolated UI preview: http://localhost:${port} (example data only)`));

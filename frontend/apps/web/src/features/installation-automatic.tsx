'use client';
import {useEffect,useRef,useState} from 'react';
import {Action} from '@community-go/ui-adapter/action';
import {PasswordField,SelectField,TextField,CheckboxField} from '@community-go/ui-adapter/form-field';
import {ConfirmDialog} from '@community-go/ui-adapter/overlays';
import {useSetupAccess} from '../host/use-setup-access';
import {useInstallationLeave} from '../host/use-installation-leave';
import {api,errorMessage,ApiError} from '../lib/api';
import {normalizeStalwart,defaultDocs} from './installation-help';
import {Installation as AdvancedInstallation} from './installation-editor';

type Spec={brand:string;domain:string;publicOrigin:string;createDomain:boolean;operatorMode:string;operatorEmail:string;recoveryEmail:string;cloudflareAccount:string};
type Job={base:string;id:string;status:string;step:string;error:string;spec:Spec;resources:Record<string,string>;completed:string[]};
type Status={brand:string;domain:string;version:string;configured:boolean;needsOperator:boolean;instanceId:string};
const steps:Record<string,string>={domain:'邮箱域名',directory:'专用服务身份与密钥',notification:'验证码发件邮箱与密钥',hook:'提交策略 Hook',turnstile:'Turnstile',operator:'运营邮箱',scope:'账号策略同步',verify:'连接检查',apply:'应用配置',completed:'配置完成'};
export function Installation({initialStatus}:{initialStatus?:Status}){
 const{token,setToken,origin}=useSetupAccess();
 const[advanced,setAdvanced]=useState(false),[status,setStatus]=useState<Status|null>(initialStatus??null),[loaded,setLoaded]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const[base,setBase]=useState(''),[mode,setMode]=useState('password'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[apiKey,setApiKey]=useState(''),[cfToken,setCfToken]=useState(''),[operatorPassword,setOperatorPassword]=useState('');
 const[spec,setSpec]=useState<Spec>({brand:'Mail Web',domain:'',publicOrigin:'',createDomain:false,operatorMode:'existing',operatorEmail:'',recoveryEmail:'',cloudflareAccount:''});
 const[ticket,setTicket]=useState(''),[domains,setDomains]=useState<{id:string;name:string}[]>([]),[accounts,setAccounts]=useState<{id:string;name:string}[]>([]),[preview,setPreview]=useState<string[]|null>(null),[job,setJob]=useState<Job|null>(null),[dirty,setDirty]=useState(false),[applied,setApplied]=useState(false);
 const generation=useRef(0),alive=useRef(true),leave=useInstallationLeave(dirty&&!pending&&!job);
 const auth=()=>token?{Authorization:'Bearer '+token}:undefined;
 const change=(key:keyof Spec,value:string|boolean)=>{setSpec(s=>({...s,[key]:value}));setDirty(true);setPreview(null);};
 const clearSecrets=()=>{setPassword('');setApiKey('');setCfToken('');setOperatorPassword('');setTicket('');};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
 async function load(){setPending(true);setError('');try{const current=initialStatus??await api<Status>('/installation');setStatus(current);
  const prior=await api<{job:Job|null}>('/installation/initialize/job',{headers:auth()});
  if(prior.job){setJob(prior.job);setSpec(prior.job.spec);setBase(prior.job.base);}
  if(current.configured){const value=await api<{settings:{brand:string;domain:string;publicOrigin:string;stalwartUrl:string}}>('/installation/config',{headers:auth()});setBase(value.settings.stalwartUrl);if(!prior.job)setSpec(s=>({...s,brand:value.settings.brand,domain:value.settings.domain,publicOrigin:value.settings.publicOrigin}));}
  else setSpec(s=>({...s,publicOrigin:s.publicOrigin||origin}));setLoaded(true);
 }catch(e){setError(errorMessage(e));setLoaded(false);}finally{setPending(false);}}
 useEffect(()=>{if(origin)void load();},[origin,token]);
 useEffect(()=>{if(!job||!['running','applying'].includes(job.status))return;let active=true;const timer=setInterval(()=>{void api<{job:Job}>('/installation/initialize/job',{headers:auth()}).then(value=>{if(active){setJob(value.job);if(!['running','applying'].includes(value.job.status)){clearSecrets();setDirty(false);}}}).catch(e=>{if(active)setError(errorMessage(e));});},1000);return()=>{active=false;clearInterval(timer);};},[job?.status,token]);
 useEffect(()=>{if(job?.status!=='completed')return;let active=true;const timer=setInterval(()=>{void api<Status>('/installation').then(current=>{if(active&&current.configured){setApplied(true);setStatus(current);}}).catch(()=>{});},1500);return()=>{active=false;clearInterval(timer);};},[job?.status]);
 async function authorize(){const at=++generation.current;setPending(true);setError('');setPreview(null);setTicket('');try{
  const value=await api<{ticket:string;domains:{id:string;name:string}[];cloudflareAccounts:{id:string;name:string}[];missingPermissions:string[]}>('/installation/initialize/authorize',{method:'POST',headers:auth(),body:JSON.stringify({base:normalizeStalwart(base),username:mode==='password'?username:'',password:mode==='password'?password:'',apiKey:mode==='key'?apiKey:'',cloudflareToken:cfToken,operatorPassword})});
  if(at!==generation.current||!alive.current)return;setTicket(value.ticket);if(value.missingPermissions.length)setError('缺少管理员权限：'+value.missingPermissions.join('、'));setDomains(value.domains);setAccounts(value.cloudflareAccounts);if(value.cloudflareAccounts.length===1)change('cloudflareAccount',value.cloudflareAccounts[0].id);setPassword('');setApiKey('');setCfToken('');
 }catch(e){if(at===generation.current)setError(errorMessage(e));}finally{if(at===generation.current)setPending(false);}}
 async function preflight(){setPending(true);setError('');try{const value=await api<{resources:string[]}>('/installation/initialize/preflight',{method:'POST',headers:auth(),body:JSON.stringify({ticket,spec,operatorPassword})});setPreview(value.resources);}catch(e){setError(errorMessage(e));}finally{setPending(false);}}
 async function start(){setPending(true);setError('');try{const result=await api<{job:Job}>('/installation/initialize/job',{method:'POST',headers:auth(),body:JSON.stringify({ticket,spec,operatorPassword})});setJob(result.job);setDirty(false);setOperatorPassword('');}catch(e){setError(errorMessage(e));}finally{setPending(false);}}
 async function cancel(){setPending(true);try{await api('/installation/initialize/cancel',{method:'POST',headers:auth()});clearSecrets();setPreview(null);if(job?.status!=='running'){setJob(null);setDirty(false);}}catch(e){setError(errorMessage(e));}finally{setPending(false);}}
 if(advanced)return <AdvancedInstallation initialToken={token} initialStatus={status??undefined}/>;
 const running=!!job&&['running','applying'].includes(job.status),finished=job?.status==='completed',frozen=!!job,disabled=pending||running||!loaded;
 return <main className="installation-shell"><header><p className="muted">Webmail · 自动配置</p><h1>一次授权，自动连接邮件服务</h1><p>连接授权 → 选择域名 → 自动初始化 → 查看结果</p><a href={defaultDocs+'#automatic'} target="_blank" rel="noopener noreferrer">查看自动配置教程 ↗</a></header>
 <section className="installation-access"><PasswordField showLabel="显示" hideLabel="隐藏" label="安装管理令牌" purpose="current" value={token} onChange={e=>setToken(e.target.value)} hint="首次安装使用；已登录的运营身份无需填写。"/><Action disabled={pending||dirty||running} variant="secondary" onPress={()=>void load()}>读取现有配置／重试</Action></section>
 {!loaded&&<p role="status">现有配置尚未读取，暂不能初始化。请登录运营身份或输入安装管理令牌后重试。</p>}
 {error&&<p role="alert" className="installation-feedback">{error}</p>}
 {!finished&&<form className="installation-form" onSubmit={e=>e.preventDefault()}>
 <section className="installation-card"><h2>1. 连接与临时授权</h2><TextField label="Stalwart 服务地址" value={base} disabled={disabled||frozen} placeholder="https://mail.example.com" onChange={e=>{generation.current++;setBase(e.target.value);clearSecrets();setPreview(null);setDirty(true);void api('/installation/initialize/cancel',{method:'POST',headers:auth()}).catch(()=>{});}} onBlur={()=>{const value=normalizeStalwart(base);if(value)setBase(value);}}/>
 <SelectField label="授权方式" value={mode} disabled={disabled} options={[{label:'管理员账号密码（默认）',value:'password'},{label:'管理员 API 密钥',value:'key'}]} onValueChange={v=>{setMode(v);setPassword('');setApiKey('');setTicket('');}}/>
 {mode==='password'?<div className="installation-grid"><TextField label="Stalwart 管理员账号" value={username} disabled={disabled} onChange={e=>setUsername(e.target.value)}/><PasswordField showLabel="显示" hideLabel="隐藏" label="Stalwart 管理员密码" purpose="current" value={password} disabled={disabled} onChange={e=>setPassword(e.target.value)}/></div>:<PasswordField showLabel="显示" hideLabel="隐藏" label="Stalwart 管理员 API 密钥" purpose="current" value={apiKey} disabled={disabled} onChange={e=>setApiKey(e.target.value)}/>}
 <p className="muted">仅用于本次初始化，不保存管理员凭据。启用双重验证后，请使用 API 密钥。运行所需的专用身份和密钥会自动创建。</p>
 <PasswordField showLabel="显示" hideLabel="隐藏" label="Cloudflare API Token（可选）" purpose="current" value={cfToken} disabled={disabled} hint="需要目标账号的 Turnstile 写入权限；自动创建 Widget 后丢弃 Token。留空保留已保存的 Turnstile 配置。" onChange={e=>setCfToken(e.target.value)}/>
 <Action variant="secondary" disabled={disabled||!normalizeStalwart(base)||(mode==='password'?(!username||!password):!apiKey)} onPress={()=>void authorize()}>验证授权并读取域名</Action>{ticket&&<p role="status">临时授权成功。管理员凭据已从输入框清除，闲置十分钟后授权失效。</p>}
 </section>
 <section className="installation-card"><h2>2. 域名、网站与运营邮箱</h2><div className="installation-grid"><TextField label="站点名称" value={spec.brand} disabled={disabled||frozen} onChange={e=>change('brand',e.target.value)}/><TextField label="Webmail 网站访问地址" value={spec.publicOrigin} disabled={disabled||frozen} onChange={e=>change('publicOrigin',e.target.value)}/></div>
 <CheckboxField label="在 Stalwart 新建邮箱域名" checked={spec.createDomain} disabled={disabled||frozen} onCheckedChange={value=>change('createDomain',value)}/>
 {spec.createDomain?<TextField label="新邮箱域名" value={spec.domain} disabled={disabled||frozen} placeholder="example.com" onChange={e=>change('domain',e.target.value.toLowerCase())}/>:<SelectField label="邮箱域名" placeholder="授权后读取，多个域名请明确选择" value={spec.domain||null} disabled={disabled||frozen} options={[...domains,...(spec.domain&&!domains.some(d=>d.name===spec.domain)?[{id:'saved',name:spec.domain}]:[])].map(d=>({label:d.name,value:d.name}))} onValueChange={v=>change('domain',v)}/>}
 <p className="muted">邮箱域名是地址中 @ 后的部分，与 Stalwart 服务地址和 Webmail 网站地址不同。</p>
 {status?.needsOperator&&<><SelectField label="运营邮箱准备方式" value={spec.operatorMode} disabled={disabled||frozen} options={[{label:'绑定已有普通邮箱（默认）',value:'existing'},{label:'新建普通运营邮箱',value:'new'}]} onValueChange={v=>change('operatorMode',v)}/><TextField label="运营邮箱地址" value={spec.operatorEmail} disabled={disabled||frozen} placeholder={'operator@'+(spec.domain||'example.com')} onChange={e=>change('operatorEmail',e.target.value.toLowerCase())}/><PasswordField showLabel="显示" hideLabel="隐藏" label={spec.operatorMode==='new'?'设置运营邮箱密码':'现有运营邮箱密码'} purpose={spec.operatorMode==='new'?'new':'current'} value={operatorPassword} disabled={disabled} onChange={e=>{setOperatorPassword(e.target.value);setPreview(null);}}/><TextField label="外部恢复邮箱" value={spec.recoveryEmail} disabled={disabled||frozen} onChange={e=>change('recoveryEmail',e.target.value)}/></>}
 {accounts.length>1?<SelectField label="Cloudflare 账号" value={spec.cloudflareAccount||null} options={accounts.map(a=>({label:a.name,value:a.id}))} disabled={disabled||frozen} onValueChange={v=>change('cloudflareAccount',v)}/>:<TextField label="Cloudflare Account ID（使用自动 Turnstile 时填写）" value={spec.cloudflareAccount} disabled={disabled||frozen} hint="能读取唯一账号时自动填入；Token 无账号列表权限时，可直接填写目标 Account ID。" onChange={e=>change('cloudflareAccount',e.target.value)}/>}
 
 </section>
 <section className="installation-card"><h2>3. 自动创建与核对</h2><p>自动创建本安装专用服务身份、验证码发件邮箱、密钥及提交 Hook；不修改 DNS，不自动开放注册。</p><Action variant="secondary" disabled={disabled||!ticket||!spec.domain} onPress={()=>void preflight()}>检查并预览配置</Action>{preview&&<><ul>{preview.map(item=><li key={item}>{item}</li>)}{spec.cloudflareAccount&&<li>本网站专用 Turnstile Widget</li>}</ul><Action disabled={disabled} onPress={()=>void start()}>{job?'重新授权并继续配置':'自动配置'}</Action></>}
 <div className="installation-actions"><Action variant="secondary" disabled={pending||job?.status==='applying'} onPress={()=>void cancel()}>取消授权／停止后续步骤</Action><Action variant="secondary" disabled={running||pending||dirty||!!ticket} onPress={()=>{clearSecrets();setAdvanced(true);}}>高级手工配置</Action></div></section></form>}
 {job&&<section className="installation-card" aria-live="polite"><h2>{finished?'配置结果':'配置进度'}</h2><p>{steps[job.step]??job.step} · {({running:'处理中',applying:'正在应用配置并检查回调',failed:'失败，已保留进度',interrupted:'服务中断，请重新授权继续',cancelled:'已取消，已创建资源保留',completed:'资源创建完成'} as Record<string,string>)[job.status]??job.status}</p>{job.error&&<p role="alert">{errorMessage(new ApiError(400,job.error))}</p>}<ul>{Object.entries(job.resources).map(([name,id])=><li key={name}>{name}：{id}</li>)}</ul>{finished&&<><p>连接检查通过。{applied?'配置已应用。':'正在应用配置并等待服务重启…'}</p><p>提交协议尚未记录验收声明；自动创建完成不等于公网注册及投递已验收。</p><a href="/">进入邮箱</a><Action variant="secondary" onPress={()=>setAdvanced(true)}>查看高级配置</Action></>}</section>}
 <ConfirmDialog triggerLabel="离开配置" title="放弃未保存的输入？" description="管理员凭据不会保存。" impact="离开后需要重新授权。" cancelLabel="继续编辑" confirmLabel="放弃并离开" failureMessage="无法离开，请重试。" isOpen={!!leave.href} onOpenChange={open=>{if(!open)leave.cancel();}} onConfirm={()=>{clearSecrets();setDirty(false);leave.leave();}}/>
 </main>;
}

'use client';
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {Action} from '@community-go/ui-adapter/action';
import {PasswordField,TextField} from '@community-go/ui-adapter/form-field';
import {DisclosurePanel} from '@community-go/ui-adapter/disclosure';
import {useSetupAccess} from '../host/use-setup-access';
import {useSiteSettings} from '../host/site-settings';
import {api,errorMessage} from '../lib/api';
import type {components} from '../lib/generated-api';

type Status=components['schemas']['InstallationStatus'];
type Settings=components['schemas']['ConfigurationInput'];
type View=components['schemas']['ConfigurationView'];
const empty:Settings={brand:'Mail Web',domain:'',publicOrigin:'',stalwartUrl:'',domainId:'',notificationAccount:'',notificationEmail:'',hookId:'',turnstileSiteKey:''};

export function InstallationGate({children,onSite}:{children:ReactNode;onSite:(site:{brand:string;domain:string})=>void}){
 const[status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setError('');void api<Status>('/installation').then(value=>{if(active){setStatus(value);const brand=value.brand||'Mail Web';onSite({brand,domain:value.domain});}}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};},[revision,onSite]);
 if(error)return <main className="installation-shell" role="alert"><h1>无法读取站点配置</h1><p>{error}</p><Action onPress={()=>setRevision(n=>n+1)}>重新连接</Action></main>;
 if(!status)return <main className="installation-shell" role="status">正在读取站点配置…</main>;
 if(!status.configured||status.needsOperator)return <Installation initialStatus={status}/>;
 return children;
}

export function Installation({initialStatus}:{initialStatus?:Status}){
 const setSite=useSiteSettings(s=>s.setSite);
 const{token,setToken,origin}=useSetupAccess();
 const[status,setStatus]=useState<Status|null>(initialStatus??null),[settings,setSettings]=useState<Settings>(empty),[view,setView]=useState<View|null>(null);
 const[pending,setPending]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false),[waiting,setWaiting]=useState(false),[stage,setStage]=useState<'connection'|'operator'>(initialStatus?.configured&&initialStatus.needsOperator?'operator':'connection');
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[recovery,setRecovery]=useState('');
 const headers=()=>token?{Authorization:'Bearer '+token}:undefined;
 useEffect(()=>{setSettings(s=>s.publicOrigin?s:{...s,publicOrigin:origin});},[origin]);
 useEffect(()=>{if(initialStatus)return;let active=true;void api<Status>('/installation').then(value=>{if(active){setStatus(value);if(value.configured&&value.needsOperator)setStage('operator');}}).catch(()=>{});return()=>{active=false;};},[initialStatus]);
 async function load(){setPending(true);setFailed(false);setNotice('');try{const value=await api<View>('/installation/config',{headers:headers()});setView(value);setSettings({...value.settings,publicOrigin:value.settings.publicOrigin||origin});}catch(e){setFailed(true);setNotice(errorMessage(e));}finally{setPending(false);}}
 useEffect(()=>{if(token.length===64)void load();},[token]);
 useEffect(()=>{if(!waiting)return;let active=true,timer:ReturnType<typeof setTimeout>|undefined;let attempts=0;const previous=status?.instanceId;
  const poll=async()=>{try{const value=await api<Status>('/installation');if(active&&value.configured&&value.instanceId!==previous){setStatus(value);setSite({brand:value.brand||'Mail Web',domain:value.domain});setWaiting(false);setPending(false);setFailed(false);setNotice('配置已应用。');setStage(value.needsOperator?'operator':'connection');return;}}catch{}if(!active)return;if(++attempts>=40){setWaiting(false);setPending(false);setFailed(true);setNotice('配置已保存，服务尚未完成重启。请检查容器状态，再重新连接。');return;}timer=setTimeout(()=>void poll(),1000);};timer=setTimeout(()=>void poll(),700);return()=>{active=false;if(timer)clearTimeout(timer);};
 },[waiting,status?.instanceId]);
 function update(key:keyof Settings,value:string){setSettings(s=>({...s,[key]:value}));}
 async function save(){setPending(true);setFailed(false);setNotice('');try{await api('/installation/config',{method:'PUT',headers:headers(),body:JSON.stringify(settings)});setWaiting(true);setNotice('配置已保存，正在应用并等待服务重启…');}catch(e){setPending(false);setFailed(true);setNotice(errorMessage(e));}}
 async function enroll(){setPending(true);setFailed(false);setNotice('');try{await api('/installation/operator',{method:'POST',headers:headers(),body:JSON.stringify({email,password,recovery})});setPassword('');location.assign('/');}catch(e){setFailed(true);setNotice(errorMessage(e));}finally{setPending(false);}}
 const secret=(key:'provisioningKey'|'notificationKey'|'hookSecret'|'turnstileSecret',label:string,isSet:boolean)=> <PasswordField key={key} label={label} purpose="new" showLabel="显示" hideLabel="隐藏" hint={isSet?'已设置；留空保留现有值。':'仅加密保存，不会回显。'} value={settings[key]??''} disabled={pending} onChange={e=>update(key,e.target.value)}/>;
 return <main className="installation-shell"><header><p className="muted">Mail Web · {status?.configured?'站点配置':'首次安装'}</p><h1>{stage==='operator'?'初始化运营身份':'连接你的邮件服务'}</h1><p>站点名称和邮箱域名由此部署配置。邮件保存在你现有的 Stalwart 中。</p></header>
  <section className="installation-access"><PasswordField label="安装管理令牌" purpose="current" showLabel="显示令牌" hideLabel="隐藏令牌" value={token} disabled={pending} hint="使用安装器提供的令牌，或已登录的运营身份。令牌仅保留在当前页面内存。" onChange={e=>setToken(e.target.value)}/><Action variant="secondary" disabled={pending} onPress={()=>void load()}>读取现有配置</Action></section>
  {stage==='connection'?<form className="installation-form" onSubmit={e=>{e.preventDefault();void save();}}><section className="installation-card"><h2>站点与连接</h2><div className="installation-grid"><TextField label="站点名称" value={settings.brand} disabled={pending} onChange={e=>update('brand',e.target.value)}/><TextField label="邮箱域名" value={settings.domain} disabled={pending} hint="填写 Stalwart 中已存在的域名，不含 @。" onChange={e=>update('domain',e.target.value)}/><TextField label="网站访问地址" value={settings.publicOrigin} disabled={pending} hint="填写实际访问的完整来源，包含端口，不含路径。" onChange={e=>update('publicOrigin',e.target.value)}/><TextField label="Stalwart 地址" value={settings.stalwartUrl} disabled={pending} hint="填写现有服务的 HTTPS 来源，不含 /jmap 路径。" onChange={e=>update('stalwartUrl',e.target.value)}/></div>{secret('provisioningKey','专用目录服务 API 密钥',Boolean(view?.provisioningKeySet))}<p className="muted">保存前会验证连接和域名，并自动读取域名 ID。请使用专用服务身份，不填入管理员密码。</p></section>
   <DisclosurePanel title="验证邮件与注册" description="连接邮箱所需配置与公开注册分开管理。"><div className="installation-grid"><TextField label="验证邮件账号 ID" value={settings.notificationAccount??''} disabled={pending} onChange={e=>update('notificationAccount',e.target.value)}/><TextField label="验证邮件发件地址" value={settings.notificationEmail??''} disabled={pending} onChange={e=>update('notificationEmail',e.target.value)}/>{secret('notificationKey','验证邮件 API 密钥',Boolean(view?.notificationKeySet))}<TextField label="Turnstile Site Key" value={settings.turnstileSiteKey??''} disabled={pending} onChange={e=>update('turnstileSiteKey',e.target.value)}/>{secret('turnstileSecret','Turnstile Secret',Boolean(view?.turnstileSecretSet))}</div></DisclosurePanel>
   <DisclosurePanel title="提交策略" description="只连接专用于此部署的 Hook，避免改变其他应用的范围。"><div className="installation-grid"><TextField label="MTA Hook ID" value={settings.hookId??''} disabled={pending} onChange={e=>update('hookId',e.target.value)}/>{secret('hookSecret','MTA Hook 共享密钥',Boolean(view?.hookSecretSet))}</div><p className="muted">配置连接不代表 SMTP／JMAP 策略已验收；公开注册保持受就绪条件约束。</p></DisclosurePanel>
   <div className="installation-actions"><Link href="/">返回邮箱</Link><Action type="submit" loading={pending} disabled={!settings.brand.trim()||!settings.domain.trim()||!settings.stalwartUrl.trim()||!settings.publicOrigin.trim()}>验证并保存</Action></div>
  </form>:<form className="installation-form installation-card" onSubmit={e=>{e.preventDefault();void enroll();}}><h2>绑定现有普通邮箱</h2><p>验证该邮箱的密码后，将它设为本部署的运营身份。Stalwart 管理员账号不用于日常 Webmail 登录。</p><TextField label="运营邮箱地址" value={email} disabled={pending} onChange={e=>setEmail(e.target.value)}/><PasswordField label="邮箱密码" purpose="current" showLabel="显示密码" hideLabel="隐藏密码" value={password} disabled={pending} onChange={e=>setPassword(e.target.value)}/><TextField label="外部恢复邮箱" value={recovery} disabled={pending} onChange={e=>setRecovery(e.target.value)}/><div className="installation-actions"><Action variant="secondary" disabled={pending} onPress={()=>setStage('connection')}>返回连接配置</Action><Action type="submit" loading={pending} disabled={!email||!password||!recovery}>验证并绑定</Action></div></form>}
  <div className="installation-feedback" role={failed?'alert':'status'}>{notice}</div>
 </main>;
}

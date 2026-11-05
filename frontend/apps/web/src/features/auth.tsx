'use client';
import {useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import {useFrontendTranslation} from '@community-go/i18n';
import {Action} from '@community-go/ui-adapter/action';
import {TextField,PasswordField,SelectField} from '@community-go/ui-adapter/form-field';
import {api,errorMessage} from '../lib/api';
import {contractClient,unwrapContract} from '../lib/contract-client';
import {LoginForm} from './login-form';
import {useSiteSettings} from '../host/site-settings';
import type {components} from '../lib/generated-api';
export type Session=components['schemas']['SessionView'];
type Turnstile={render:(element:HTMLElement,options:{sitekey:string;callback:(token:string)=>void;'expired-callback':()=>void})=>string;remove:(id:string)=>void;reset:(id:string)=>void};
declare global{interface Window{turnstile?:Turnstile}}
export function Auth({onLogin}:{onLogin:(session:Session)=>void}){
 const{t}=useFrontendTranslation();
 const brand=useSiteSettings(state=>state.brand);
 const[mode,setMode]=useState<'login'|'registration'|'recovery'>('login');
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState(''),[claim,setClaim]=useState(''),[captcha,setCaptcha]=useState(''),[ready,setReady]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
 const[domains,setDomains]=useState<{id:string;domain:string;enabled:boolean;dependenciesReady:boolean}[]>([]),[domain,setDomain]=useState('default'),[policyError,setPolicyError]=useState('');
 const[policy,setPolicy]=useState({enabled:false,siteKey:'',domain:''});const target=useRef<HTMLDivElement>(null);const widget=useRef<string|undefined>(undefined);
 useEffect(()=>{const abort=new AbortController();void api<{items:typeof domains}>('/registration/domains',{signal:abort.signal}).then(r=>{if(!abort.signal.aborted)setDomains(r.items);}).catch(()=>{if(!abort.signal.aborted)setPolicyError('暂时无法获取邮箱域名，请稍后重试');});return()=>abort.abort();},[]);
 useEffect(()=>{const abort=new AbortController();setPolicy({enabled:false,siteKey:'',domain:''});setPolicyError('');void api<typeof policy>('/registration/policy?domainId='+encodeURIComponent(domain),{signal:abort.signal}).then(r=>{if(!abort.signal.aborted)setPolicy(r);}).catch(()=>{if(!abort.signal.aborted)setPolicyError('暂时无法获取注册状态，请稍后重试');});return()=>abort.abort();},[domain]);
 useEffect(()=>{if(mode==='login'||challenge||!ready||!policy.siteKey||!target.current||!window.turnstile)return;const id=window.turnstile.render(target.current,{sitekey:policy.siteKey,callback:setCaptcha,'expired-callback':()=>setCaptcha('')});widget.current=id;return()=>{window.turnstile?.remove(id);widget.current=undefined;};},[mode,ready,policy.siteKey,challenge,policy.enabled]);
 async function run(operation:()=>Promise<void>){setPending(true);setNotice('');try{await operation();}catch(error){setNotice(errorMessage(error));}finally{setPending(false);if(mode!=='login'&&!challenge){setCaptcha('');if(widget.current)window.turnstile?.reset(widget.current);}}}
 async function submit(){
  if(mode==='login')return;
  if(!challenge){const result=unwrapContract(await contractClient.POST('/api/v1/registration/challenges',{body:{email,purpose:mode,turnstile_token:captcha,domainId:mode==='registration'?domain:undefined}}));setChallenge(result.challengeId);setNotice('验证码已发送，10 分钟内有效');return;}
  if(!claim){const result=unwrapContract(await contractClient.POST('/api/v1/registration/verify',{body:{challenge_id:challenge,code}}));setClaim(result.verificationToken);return;}
  const body={challenge_id:challenge,verification_token:claim,password};
  if(mode==='registration')unwrapContract(await contractClient.POST('/api/v1/auth/register',{body:{...body,name}}));else unwrapContract(await contractClient.POST('/api/v1/auth/recovery',{body}));if(mode==='registration')setEmail(name+'@'+policy.domain);setPassword('');setMode('login');setChallenge('');setClaim('');setCode('');setCaptcha('');setNotice('操作成功，请使用邮箱地址和密码登录');
 }
 function changeDomain(next:string){setDomain(next);setChallenge('');setClaim('');setCaptcha('');setCode('');setPassword('');setNotice('');}
 function change(next:typeof mode){setCode('');setMode(next);setChallenge('');setClaim('');setCaptcha('');setPassword('');setNotice('');}
 return <main className="auth-shell"><div className="auth-card"><p className="auth-brand">{brand}</p><h1 className="text-3xl font-semibold">{t(mode==='login'?'welcome':mode==='registration'?'create':'recover')}</h1><nav className="auth-navigation" aria-label="账号入口"><Action variant="quiet" disabled={pending} onPress={()=>change('login')}>登录</Action><Action variant="quiet" disabled={pending} onPress={()=>change('registration')}>注册</Action><Action variant="quiet" disabled={pending} onPress={()=>change('recovery')}>找回密码</Action></nav>{mode==='registration'&&<SelectField label="邮箱域名" value={domain} disabled={pending} options={domains.map(d=>({value:d.id,label:d.domain+(d.enabled?'':d.dependenciesReady?'（注册已关闭）':'（暂未就绪）')}))} onValueChange={changeDomain}/>} {mode==='registration'&&policyError&&<p role="alert">{policyError}</p>}{mode==='login'?<LoginForm initialEmail={email} onLogin={onLogin}/>:mode==='registration'&&!policy.enabled?<p role="status">公开注册尚未开放。站点管理者请先完成注册条件检查。 <a href="/setup/">进入配置面板</a></p>:<form className="flex flex-col gap-4" onSubmit={event=>{event.preventDefault();void run(submit);}}>
 <p className="muted" role="status">{!challenge?'第 1 步：验证外部邮箱':!claim?'第 2 步：输入邮件中的验证码（10 分钟内有效）':'第 3 步：设置邮箱密码'}</p>{!claim&&<TextField label="用于验证的外部邮箱" disabled={pending||!!challenge} value={email} onChange={event=>setEmail(event.target.value)}/>}
 {challenge&&!claim&&<TextField label="六位验证码" value={code} onChange={event=>setCode(event.target.value)}/>}
 {mode==='registration'&&claim&&<TextField label={`邮箱名称（@${policy.domain}）`} value={name} onChange={event=>setName(event.target.value.toLowerCase())}/>}
 {claim&&<PasswordField purpose="new" showLabel="显示密码" hideLabel="隐藏密码" label="新密码（12–128 个字符）" value={password} onChange={event=>setPassword(event.target.value)}/>}
 {!challenge&&<><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={()=>setReady(true)}/><div ref={target}/></>}
 <Action type="submit" loading={pending} disabled={!challenge&&!captcha}>{!challenge?'发送验证码':!claim?'验证邮箱':mode==='registration'?'开通邮箱':'重置密码'}</Action>
 {challenge&&<Action variant="quiet" disabled={pending} onPress={()=>{setChallenge('');setClaim('');setCaptcha('');setCode('');setPassword('');}}>重新验证外部邮箱</Action>}</form>}{notice&&<p role="status" aria-live="polite">{notice}</p>}</div></main>;
}

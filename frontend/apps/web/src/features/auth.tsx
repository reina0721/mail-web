'use client';
import {useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import {useFrontendTranslation} from '@community-go/i18n';
import {Action} from '@community-go/ui-adapter/action';
import {TextField,PasswordField} from '@community-go/ui-adapter/form-field';
import {errorMessage} from '../lib/api';
import {contractClient,unwrapContract} from '../lib/contract-client';
import {LoginForm} from './login-form';
import type {components} from '../lib/generated-api';
export type Session=components['schemas']['SessionView'];
type Turnstile={render:(element:HTMLElement,options:{sitekey:string;callback:(token:string)=>void;'expired-callback':()=>void})=>string;remove:(id:string)=>void;reset:(id:string)=>void};
declare global{interface Window{turnstile?:Turnstile}}
export function Auth({onLogin}:{onLogin:(session:Session)=>void}){
 const{t}=useFrontendTranslation();
 const[mode,setMode]=useState<'login'|'registration'|'recovery'>('login');
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState(''),[claim,setClaim]=useState(''),[captcha,setCaptcha]=useState(''),[ready,setReady]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
 const[policy,setPolicy]=useState({enabled:false,siteKey:''});const target=useRef<HTMLDivElement>(null);const widget=useRef<string|undefined>(undefined);
 useEffect(()=>{void contractClient.GET('/api/v1/registration/policy').then(unwrapContract).then(setPolicy).catch(()=>setNotice('暂时无法获取注册状态'));},[]);
 useEffect(()=>{if(mode==='login'||challenge||!ready||!policy.siteKey||!target.current||!window.turnstile)return;const id=window.turnstile.render(target.current,{sitekey:policy.siteKey,callback:setCaptcha,'expired-callback':()=>setCaptcha('')});widget.current=id;return()=>{window.turnstile?.remove(id);widget.current=undefined;};},[mode,ready,policy.siteKey,challenge,policy.enabled]);
 async function run(operation:()=>Promise<void>){setPending(true);setNotice('');try{await operation();}catch(error){setNotice(errorMessage(error));}finally{setPending(false);if(mode!=='login'&&!challenge){setCaptcha('');if(widget.current)window.turnstile?.reset(widget.current);}}}
 async function submit(){
  if(mode==='login')return;
  if(!challenge){const result=unwrapContract(await contractClient.POST('/api/v1/registration/challenges',{body:{email,purpose:mode,turnstile_token:captcha}}));setChallenge(result.challengeId);setNotice('验证码已发送，10 分钟内有效');return;}
  if(!claim){const result=unwrapContract(await contractClient.POST('/api/v1/registration/verify',{body:{challenge_id:challenge,code}}));setClaim(result.verificationToken);return;}
  const body={challenge_id:challenge,verification_token:claim,password};
  if(mode==='registration')unwrapContract(await contractClient.POST('/api/v1/auth/register',{body:{...body,name}}));else unwrapContract(await contractClient.POST('/api/v1/auth/recovery',{body}));if(mode==='registration')setEmail(name+'@iqwq.com');setPassword('');setMode('login');setChallenge('');setClaim('');setNotice('操作成功，请使用邮箱地址和密码登录');
 }
 function change(next:typeof mode){setMode(next);setChallenge('');setClaim('');setCaptcha('');setPassword('');setNotice('');}
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6"><p className="text-ink-muted">独立邮箱 · IQWQ</p><h1 className="text-3xl font-semibold">{t(mode==='login'?'welcome':mode==='registration'?'create':'recover')}</h1><nav className="flex flex-wrap gap-2" aria-label="账号入口"><Action variant="quiet" onPress={()=>change('login')}>登录</Action><Action variant="quiet" onPress={()=>change('registration')}>注册</Action><Action variant="quiet" onPress={()=>change('recovery')}>找回密码</Action></nav>{mode==='login'?<LoginForm initialEmail={email} onLogin={onLogin}/>:mode==='registration'&&!policy.enabled?<p role="status">公开注册尚未开放。完成服务验收后开放申请。</p>:<form className="flex flex-col gap-4" onSubmit={event=>{event.preventDefault();void run(submit);}}>
 {!claim&&<TextField label="用于验证的外部邮箱" value={email} onChange={event=>setEmail(event.target.value)}/>}
 {challenge&&!claim&&<TextField label="六位验证码" value={code} onChange={event=>setCode(event.target.value)}/>}
 {mode==='registration'&&claim&&<TextField label="邮箱名称（@iqwq.com）" value={name} onChange={event=>setName(event.target.value.toLowerCase())}/>}
 {claim&&<PasswordField purpose="new" showLabel="显示密码" hideLabel="隐藏密码" label="新密码（12–128 个字符）" value={password} onChange={event=>setPassword(event.target.value)}/>}
 {!challenge&&<><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={()=>setReady(true)}/><div ref={target}/></>}
 <Action type="submit" loading={pending} disabled={!challenge&&!captcha}>{!challenge?'发送验证码':!claim?'验证邮箱':mode==='registration'?'开通邮箱':'重置密码'}</Action>
 {challenge&&<Action variant="quiet" disabled={pending} onPress={()=>{setChallenge('');setClaim('');setCaptcha('');setCode('');setPassword('');}}>重新验证外部邮箱</Action>}</form>}{notice&&<p role="status" aria-live="polite">{notice}</p>}</main>;
}

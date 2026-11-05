'use client';
import {useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import {Action} from '@community-go/ui-adapter/action';
import {TextField} from '@community-go/ui-adapter/form-field';
import {api,errorMessage} from '../lib/api';
import type {} from './auth';
export function ReadinessInteraction(){
 const[ticket,setTicket]=useState(''),[siteKey,setSiteKey]=useState(''),[ready,setReady]=useState(false),[captcha,setCaptcha]=useState(''),[email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[done,setDone]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');const target=useRef<HTMLDivElement>(null);
 useEffect(()=>{const fragment=new URLSearchParams(location.hash.slice(1)),value=fragment.get('check')??'';history.replaceState(history.state,'',location.pathname);setTicket(value);void api<{siteKey:string}>('/readiness/session',{method:'POST',body:JSON.stringify({ticket:value})}).then(r=>setSiteKey(r.siteKey)).catch(e=>setError(errorMessage(e)));},[]);
 useEffect(()=>{if(!ready||!siteKey||!target.current||!window.turnstile||sent)return;const id=window.turnstile.render(target.current,{sitekey:siteKey,callback:setCaptcha,'expired-callback':()=>setCaptcha('')});return()=>window.turnstile?.remove(id);},[ready,siteKey,sent]);
 async function submit(){setPending(true);setError('');try{await api(sent?'/readiness/verify':'/readiness/send',{method:'POST',body:JSON.stringify({ticket,email,code,turnstile_token:captcha})});if(sent){setDone(true);setTicket('');}else setSent(true);}catch(e){setError(errorMessage(e));}finally{setPending(false);}}
 return <main className="installation-shell"><h1>注册功能检查</h1><p>这一步只确认人机验证和验证码收信，不会创建邮箱或开启注册。</p>{done?<p role="status">检查通过。请返回配置面板刷新结果，再手动开启注册。</p>:<form className="installation-card" onSubmit={e=>{e.preventDefault();void submit();}}><TextField label="用于接收检查验证码的外部邮箱" value={email} disabled={pending||sent} onChange={e=>setEmail(e.target.value)}/>{sent?<TextField label="收到的六位验证码" value={code} onChange={e=>setCode(e.target.value)}/>:<><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={()=>setReady(true)}/><div ref={target}/></>}<Action type="submit" loading={pending} disabled={!ticket||(!sent&&!captcha)}>{sent?'核对验证码':'发送检查邮件'}</Action></form>}{error&&<p role="alert">{error}</p>}</main>;
}

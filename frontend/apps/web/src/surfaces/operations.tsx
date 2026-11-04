'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {Action} from '@community-go/ui-adapter/action';
import {api,ApiError} from '../lib/api';
import {Auth,type Session} from '../features/auth';
import {Admin} from '../features/admin';
import {operationsSurface,webmailSurface} from './catalog';

export function OperationsSurface(){
 const[session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;void api<Session>('/auth/session').then(value=>{if(active)setSession(value);}).catch(()=>{}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 if(loading)return <main className="p-8" role="status">正在验证运营权限…</main>;
 if(!session)return <Auth onLogin={setSession}/>;
 return <div className="min-h-screen"><a href="#operations-main" className="sr-only focus:not-sr-only">跳至运营内容</a>
  <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
   <strong className="text-xl">IQWQ 平台运营</strong>
   <nav className="flex flex-wrap gap-4" aria-label="运营导航">{[...webmailSurface.navigation,...operationsSurface.navigation].flatMap(group=>group.parents).filter(item=>item.href).map(item=><Link key={item.navigationId} href={item.href!}>{item.labelKey}</Link>)}</nav>
   <span className="break-all text-sm text-ink-muted">{session.email}</span>
   <Action variant="quiet" onPress={()=>void api('/auth/logout',{method:'POST'}).then(()=>setSession(null)).catch(error=>{if(error instanceof ApiError&&error.status===401)setSession(null);else setNotice('暂时无法退出，请稍后重试');})}>退出</Action>
  </header>
  {notice&&<p role="alert">{notice}</p>}
  <div id="operations-main">{session.operator?<Admin/>:<main className="p-8" role="alert">此账号没有运营权限。<Link href="/">返回邮箱</Link></main>}</div>
 </div>;
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Auth, type Session } from '../features/auth';
import { Admin } from '../features/admin';
import { useSessionPreferences } from '../host/session-preferences';
import { Brand, AccountMenu } from '../features/mail-ui';
export function OperationsSurface() {
    const [session, setSession] = useState<Session | null>(null), [loading, setLoading] = useState(true), [notice, setNotice] = useState('');
    useSessionPreferences(session?.email);
    useEffect(() => { let active = true; void api<Session>('/auth/session').then(value => { if (active)
        setSession(value); }).catch(() => { }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, []);
    if (loading)
        return <main className="p-8" role="status">正在验证运营权限…</main>;
    if (!session)
        return <Auth onLogin={setSession}/>;
    return <div className="admin-app"><a href="#operations-main" className="skip-link">跳至运营内容</a>
  <header className="admin-header">
   <Brand admin/><span className="admin-header-caption">邮箱运营工作台</span><Link className="back-to-mail" href="/">返回邮箱 ↗</Link>
   <AccountMenu session={session} onLogout={() => void api('/auth/logout', { method: 'POST' }).then(() => setSession(null)).catch(error => { if (error instanceof ApiError && error.status === 401)
        setSession(null);
    else
        setNotice('暂时无法退出，请稍后重试'); })}/>
  </header>
  {notice && <p role="alert">{notice}</p>}
  {session.operator ? <Admin identity={session.id} onExpired={() => setSession(null)}/> : <main className="p-8" role="alert">此账号没有运营权限。<Link href="/">返回邮箱</Link></main>}
 </div>;
}

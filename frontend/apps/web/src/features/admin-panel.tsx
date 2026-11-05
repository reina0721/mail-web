'use client';
import { useEffect, useState, useRef } from 'react';
import {RegistrationReadiness} from './registration-readiness';
import {ContentSwapTransition} from '@community-go/ui-adapter/content-swap-transition';
import {IconAction} from '@community-go/ui-adapter/icon-action';
import { Action } from '@community-go/ui-adapter/action';
import { TextField, SelectField, SwitchField } from '@community-go/ui-adapter/form-field';
import { SearchBox } from '@community-go/ui-adapter/search-box';
import { DrawerSurface, ConfirmDialog } from '@community-go/ui-adapter/overlays';
import { api, errorMessage, ApiError } from '../lib/api';
import { contractClient, unwrapContract } from '../lib/contract-client';
import type { components } from '../lib/generated-api';
import { MailIcon, EmptyState } from './mail-ui';
import { AccountTable, AuditList, Status, states, type User, type Audit } from './admin-ui';
type Policy = components['schemas']['RegistrationPolicy'];
type Tasks = {
    accountPolicyJobs: number;
    credentialRevocations: number;
    registrationReconciliation: number;
};
type Section = 'overview' | 'users' | 'registration' | 'activity';
const sections: {
    id: Section;
    label: string;
    icon: string;
    description: string;
}[] = [{ id: 'overview', label: '概览', icon: 'grid', description: '邮箱运营情况，一目了然。' }, { id: 'users', label: '邮箱账号', icon: 'users', description: '管理邮箱账号、容量配额和发信限额。' }, { id: 'registration', label: '注册策略', icon: 'settings', description: '控制公开注册与新账号的默认策略。' }, { id: 'activity', label: '任务与审计', icon: 'activity', description: '查看后台同步任务和最近的操作记录。' }];
const policyFields = [{ key: 'maximumAccounts', label: '普通邮箱名额', hint: '最多 100 个普通邮箱', scale: 1 }, { key: 'quotaBytes', label: '默认容量（MiB）', hint: '每个新邮箱的容量配额', scale: 1048576 }, { key: 'attachmentBytes', label: '附件上限（MiB）', hint: '每封合计，最多 20 MiB', scale: 1048576 }, { key: 'hourlyRecipients', label: '每小时外部收件人数', hint: '新账号每小时发信限额', scale: 1 }, { key: 'dailyRecipients', label: '每天外部收件人数', hint: '新账号每日发信限额', scale: 1 }] as const;
function validPolicy(p: Policy) { return policyFields.every(f => Number.isSafeInteger(p[f.key]) && p[f.key] > 0) && p.maximumAccounts <= 100 && p.attachmentBytes <= 20971520 && p.hourlyRecipients <= 10000 && p.dailyRecipients <= 100000 && p.dailyRecipients >= p.hourlyRecipients; }
export function Admin({ onExpired, identity }: {
    onExpired: () => void;
    identity: string;
}) {
    const [section, setSection] = useState<Section>('overview'), [users, setUsers] = useState<User[]>([]), [policy, setPolicy] = useState<Policy | null>(null), [savedPolicy, setSavedPolicy] = useState<Policy | null>(null), [tasks, setTasks] = useState<Tasks | null>(null), [audit, setAudit] = useState<Audit[]>([]), [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [pending, setPending] = useState(false), [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [editing, setEditing] = useState<User | null>(null), [original, setOriginal] = useState<User | null>(null), [confirmDisable, setConfirmDisable] = useState(false), [leave, setLeave] = useState<Section | 'editor' | 'navigation' | null>(null), [leaveHref, setLeaveHref] = useState(''), [navigateTo, setNavigateTo] = useState('');
    const busy = useRef(false), mounted = useRef(true);
    const dirty = !!policy && !!savedPolicy && JSON.stringify(policy) !== JSON.stringify(savedPolicy), editorDirty = !!editing && JSON.stringify(editing) !== JSON.stringify(original);
    function failed(e: unknown) { if (e instanceof ApiError && e.status === 401)
        onExpired();
    else
        setNotice(errorMessage(e)); }
    async function load() { const [u, p, t, a] = await Promise.all([api<{
            items: User[];
        }>('/admin/users'), api<{
            policy: Policy;
            dependenciesReady: boolean;
        }>('/admin/registration'), api<Tasks>('/admin/tasks'), api<{
            items: Audit[];
        }>('/admin/audit')]); if (!mounted.current)
        return; setUsers(u.items); setPolicy(p.policy); setSavedPolicy(p.policy); setReady(p.dependenciesReady); setTasks(t); setAudit(a.items); }
    async function reload() { if(!policy)setLoading(true); setError(''); try {
        await load();
    }
    catch (e) {
        if (mounted.current) {
            setError(errorMessage(e));
            failed(e);
        }
    }
    finally {
        if (mounted.current)
            setLoading(false);
    } }
    useEffect(() => { mounted.current = true; const sync = () => { const id = new URLSearchParams(location.search).get('section'); setSection(sections.some(s => s.id === id) ? id as Section : 'overview'); }; sync(); void reload(); window.addEventListener('popstate', sync); return () => { mounted.current = false; window.removeEventListener('popstate', sync); }; }, []);
    useEffect(() => { if (!dirty && !editorDirty)
        return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty, editorDirty]);
    useEffect(() => { if (!dirty && !editorDirty)
        return; const guard = (event: MouseEvent) => { const target = event.target instanceof Element ? event.target.closest('a[href]') : null; if (!target || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return; const href = target.getAttribute('href'); if (!href || href.startsWith('#'))
        return; event.preventDefault(); event.stopPropagation(); setLeaveHref(href); setLeave('navigation'); }; document.addEventListener('click', guard, true); return () => document.removeEventListener('click', guard, true); }, [dirty, editorDirty]);
    useEffect(() => { if (navigateTo)
        location.assign(navigateTo); }, [navigateTo]);
    function go(id: Section) { setSection(id); history.pushState(null, '', '/admin/?section=' + id); setNotice(''); }
    function navigate(id: Section) { if (id === section)
        return; if (dirty) {
        setLeave(id);
        return;
    } go(id); }
    async function run(work: () => Promise<void>) { if (busy.current)
        return; busy.current = true; setPending(true); setNotice(''); try {
        await work();
    }
    catch (e) {
        failed(e);
    }
    finally {
        busy.current = false;
        setPending(false);
    } }
    async function change(enabled: boolean) { if (!editing)
        return; await api('/admin/users/' + encodeURIComponent(editing.id), { method: 'PATCH', body: JSON.stringify({ enabled, quota_bytes: editing.quotaBytes, hourly_recipients: editing.hourlyRecipients, daily_recipients: editing.dailyRecipients }) }); await load(); setEditing(null); setOriginal(null); setNotice('账号策略已保存，正在同步邮件服务。'); }
    const taskCount = tasks ? tasks.accountPolicyJobs + tasks.credentialRevocations + tasks.registrationReconciliation : 0;
    const filtered = users.filter(u => (filter === 'all' || u.status === filter) && u.email.toLowerCase().includes(search.toLowerCase()));
    const current = sections.find(s => s.id === section)!;
    const openUser = (u: User) => { setEditing({ ...u }); setOriginal({ ...u }); };
    const editorValid = !!editing && [editing.quotaBytes, editing.hourlyRecipients, editing.dailyRecipients].every(n => Number.isSafeInteger(n) && n > 0) && editing.dailyRecipients >= editing.hourlyRecipients;
    return <div className="admin-layout"><aside className="admin-sidebar"><p className="nav-eyebrow">工作空间</p><nav aria-label="后台分区">{sections.map(s => <button type="button" key={s.id} className={'folder-link' + (s.id === section ? ' is-current' : '')} aria-current={s.id === section ? 'page' : undefined} onClick={() => navigate(s.id)}><MailIcon name={s.icon}/><span>{s.label}</span></button>)}</nav><div className="sidebar-footer"><span className="sidebar-rule"/><span>平台运营</span><small>管理账号，保持有序。</small></div></aside><main id="operations-main" className="admin-content"><div className="admin-page-heading"><div><ContentSwapTransition contentKey={section}><h1>{current.label}</h1></ContentSwapTransition><p>{current.description}</p></div><IconAction variant="quiet" size="sm" tooltip label="刷新运营数据" disabled={loading||pending||dirty} onPress={()=>void reload()}><MailIcon name="refresh"/></IconAction></div>{notice && <div className="inline-notice admin-feedback" role="status">{notice}</div>}{loading ? <div className="admin-loading" role="status"><EmptyState title="正在加载运营数据…" description="正在获取账号、策略和操作记录。"/></div> : error ? <div className="load-error" role="alert"><EmptyState title="无法加载运营数据" description={error}/><Action onPress={() => void reload()}>重新加载</Action></div> : <div key={section} className="admin-section">
 {section === 'overview' && <><div className="stat-grid">{[{ label: '邮箱账号', value: users.length, caption: '包含普通邮箱与运营账号', icon: 'users' }, { label: '已停用账号', value: users.filter(u => u.status === 'disabled').length, caption: '当前处于停用状态', icon: 'junk' }, { label: '公开注册', value: policy?.enabled ? (ready?'已开放':'暂停接受注册') : '已关闭', caption: ready ? '运行配置已就绪' : '尚未满足开放条件', icon: 'settings' }, { label: '待处理任务', value: taskCount, caption: '策略同步、凭据与开户核对', icon: 'activity' }].map(s => <section className="stat-card" key={s.label}><div><span>{s.label}</span><MailIcon name={s.icon}/></div><strong>{s.value}</strong><p>{s.caption}</p></section>)}</div><div className="overview-grid"><section className="admin-card"><div className="card-heading"><div><h2>邮箱账号</h2><p>最近返回的账号与当前状态</p></div><button type="button" className="text-link" onClick={() => navigate('users')}>查看全部 →</button></div>{users.length ? <AccountTable items={users.slice(0, 5)} onOpen={openUser}/> : <EmptyState title="暂无邮箱账号" description="创建的邮箱账号会出现在这里。" icon="users"/>}</section><section className="admin-card"><div className="card-heading"><h2>注册与运行配置</h2><MailIcon name="settings"/></div><div className="policy-summary"><span className={'status-badge ' + (policy?.enabled ? 'status-good' : 'status-muted')}>{policy?.enabled ? (ready?'策略已开启 · 当前可注册':'策略已开启 · 当前暂停注册') : '注册已关闭'}</span><h3>{ready ? '已具备开放条件' : '开放条件尚未满足'}</h3><p>{ready ? '可以在注册策略中调整公开注册和默认限额。' : '当前服务尚未满足注册依赖条件。保持注册关闭，完成部署验收后再开放。'}</p><dl><div><dt>普通邮箱名额</dt><dd>{policy?.maximumAccounts}</dd></div><div><dt>新邮箱容量</dt><dd>{(policy?.quotaBytes ?? 0) / 1048576} MiB</dd></div><div><dt>附件上限</dt><dd>{(policy?.attachmentBytes ?? 0) / 1048576} MiB</dd></div></dl><Action variant="secondary" fullWidth onPress={() => navigate('registration')}>管理注册策略</Action></div></section></div><section className="admin-card"><div className="card-heading"><div><h2>最近操作</h2><p>平台管理操作的审计记录</p></div><button type="button" className="text-link" onClick={() => navigate('activity')}>全部记录 →</button></div>{<AuditList audit={audit} users={users} limit={3}/>}</section></>}
 {section === 'users' && <section className="admin-card"><div className="card-heading"><div><h2>全部账号 <span className="count-pill">{users.length}</span></h2><p>容量和发信限额可在账号详情中调整。</p></div></div><div className="table-filters"><SearchBox label="搜索邮箱账号" placeholder="搜索邮箱地址…" value={search} onValueChange={setSearch}/><SelectField label="账号状态" value={filter} options={[{ value: 'all', label: '全部状态' }, ...Object.entries(states).map(([value, label]) => ({ value, label }))]} onValueChange={v => setFilter(v ?? 'all')}/></div>{filtered.length ? <AccountTable items={filtered} onOpen={openUser}/> : <EmptyState title="没有匹配的账号" description="调整搜索关键词或状态筛选。" icon="users"/>}<div className="table-footer">共 {filtered.length} 个账号</div></section>}
 {section === 'registration' && policy && <><RegistrationReadiness onChange={setReady}/><div className={'registration-banner ' + (ready ? 'is-ready' : '')}><MailIcon name={ready ? 'check' : 'junk'}/><div><strong>{ready ? '运行配置已就绪' : '公开注册尚未满足开放条件'}</strong><p>{ready ? '开放前，请核对以下默认策略。' : '请完成下面的注册条件清单；每项均提供检查结果和修复入口。'}</p></div></div><section className="admin-card policy-card"><div className="card-heading"><div><h2>公开注册</h2><p>控制新用户能否申请邮箱。</p></div><SwitchField label="开放公开注册" description="保存策略后生效" presentation="row" checked={policy.enabled} disabled={pending || (!ready && !policy.enabled)} onCheckedChange={v => setPolicy({ ...policy, enabled: v })}/></div><div className="policy-form"><h3>新账号默认策略</h3><p className="muted">仅应用于新账号；已有账号请在邮箱账号中单独调整。</p><div className="policy-fields">{policyFields.map(f => <TextField key={f.key} label={f.label} hint={f.hint} value={String(policy[f.key] / f.scale)} disabled={pending} onChange={e => setPolicy({ ...policy, [f.key]: Number(e.target.value) * f.scale })}/>)}</div>{!validPolicy(policy) && <p className="field-warning" role="alert">请填写正整数：邮箱最多 100 个，附件最多 20 MiB，每小时最多 10000 人，每天最多 100000 人且不低于每小时限额。</p>}</div><div className="form-footer"><span>{dirty ? '有未保存的更改' : '所有更改已保存'}</span><Action variant="secondary" disabled={pending || !dirty} onPress={() => setPolicy(savedPolicy)}>取消更改</Action><Action leadingIcon={<MailIcon name="check"/>} loading={pending} disabled={!dirty || !validPolicy(policy)} onPress={() => void run(async () => { unwrapContract(await contractClient.PATCH('/api/v1/admin/registration', { body: policy })); await load(); setNotice('注册策略已保存。'); })}>保存策略</Action></div></section></>}
 {section === 'activity' && <><div className="task-grid">{[{ label: '账号策略同步', value: tasks?.accountPolicyJobs ?? 0 }, { label: '待撤销凭据', value: tasks?.credentialRevocations ?? 0 }, { label: '待核对开户', value: tasks?.registrationReconciliation ?? 0 }].map(t => <section key={t.label} className="stat-card"><span>{t.label}</span><strong>{t.value}</strong></section>)}</div><section className="admin-card task-summary"><div><h2>后台同步任务</h2><p>失败的同步会自动重试。开户恢复需要用户重新验证并提交密码。</p></div><Action variant="secondary" loading={pending} onPress={() => void run(async () => { const r = await api<{
            queued: number;
        }>('/admin/tasks/retry', { method: 'POST' }); await load(); setNotice(`已安排 ${r.queued} 项失败任务重新尝试。`); })}>重试失败任务</Action></section><section className="admin-card"><div className="card-heading"><div><h2>审计记录</h2><p>操作人、对象及执行结果</p></div><span className="count-pill">{audit.length} 条</span></div>{<AuditList audit={audit} users={users}/>}</section></>}
 </div>}</main>
 <DrawerSurface triggerLabel="管理账号" title="账号详情" description={editing?.email ?? ''} closeLabel="关闭账号详情" isOpen={!!editing} onOpenChange={open => { if (!open && !pending) {
        if (editorDirty)
            setLeave('editor');
        else
            setEditing(null);
    } }}><div className="drawer-form">{editing && <><div className="user-detail-heading"><Status status={editing.status}/><span className="muted">{editing.operator ? '运营账号' : '普通邮箱'}</span></div><h3>容量与发信策略</h3>{[{ key: 'quotaBytes', label: '容量（MiB）', scale: 1048576 }, { key: 'hourlyRecipients', label: '每小时外部收件人数', scale: 1 }, { key: 'dailyRecipients', label: '每天外部收件人数', scale: 1 }].map(f => <TextField key={f.key} label={f.label} disabled={pending} value={String(editing[f.key as keyof User] as number / f.scale)} onChange={e => setEditing({ ...editing, [f.key]: Number(e.target.value) * f.scale })}/>)}{!editorValid && <p role="alert" className="field-warning">请填写有效的正整数，每日限额不能低于每小时限额。</p>}{['active', 'disabled'].includes(editing.status) ? <><Action leadingIcon={<MailIcon name="check"/>} loading={pending} disabled={!editorValid} onPress={() => void run(() => change(editing.status === 'active'))}>保存更改</Action>{editing.status === 'disabled' ? <Action variant="secondary" disabled={pending || !editorValid} onPress={() => void run(() => change(true))}>启用账号</Action> : <div className="danger-zone"><h3>停用账号</h3><p>停用后将阻止平台和邮件协议访问，现有会话会失效。{editing.id === identity ? '当前运营账号不能停用自身。' : ''}</p><Action variant="danger" disabled={pending || !editorValid || editing.id === identity} onPress={() => setConfirmDisable(true)}>停用此账号</Action></div>}</> : <p>需要用户重新验证外部邮箱并提交原开户密码。归属不明的邮箱须先核对目录记录。</p>}{notice && <p role="status">{notice}</p>}</>}</div></DrawerSurface>
 <ConfirmDialog triggerLabel="停用账号" title="确认停用这个邮箱？" description={editing?.email ?? ''} impact="停用后将阻止平台和邮件协议访问，现有会话会失效。可以稍后重新启用。" cancelLabel="保留账号" confirmLabel="确认停用" failureMessage="停用未完成，请重试。" tone="danger" isOpen={confirmDisable} onOpenChange={setConfirmDisable} onConfirm={async () => { try {
        await change(false);
    }
    catch (e) {
        failed(e);
        throw e;
    } }}/>
 <ConfirmDialog triggerLabel="放弃更改" title="放弃未保存的更改？" description="离开后，未保存的修改将丢失。" impact="已保存的账号策略不会受到影响。" cancelLabel="继续编辑" confirmLabel="放弃更改" failureMessage="无法切换页面，请重试。" isOpen={leave !== null} onOpenChange={open => { if (!open)
        setLeave(null); }} onConfirm={() => { if (leave === 'navigation') {
        setPolicy(savedPolicy);
        setEditing(null);
        setOriginal(null);
        setNavigateTo(leaveHref);
    }
    else if (leave === 'editor') {
        setEditing(null);
        setOriginal(null);
    }
    else if (leave) {
        setPolicy(savedPolicy);
        go(leave);
    } setLeave(null); }}/>
 </div>;
}

'use client';
import { useEffect, useState, useRef } from 'react';
import { Action } from '@community-go/ui-adapter/action';
import { IconAction } from '@community-go/ui-adapter/icon-action';
import { TextField, CheckboxField } from '@community-go/ui-adapter/form-field';
import { SearchBox } from '@community-go/ui-adapter/search-box';
import { MenuButton } from '@community-go/ui-adapter/menu-button';
import { DrawerSurface, ConfirmDialog } from '@community-go/ui-adapter/overlays';
import {ContentSwapTransition} from '@community-go/ui-adapter/content-swap-transition';
import {useScrollHint} from '../host/use-scroll-hint';
import {useDelayedBusy} from '../host/use-delayed-busy';
import { api, ApiError, errorMessage } from '../lib/api';
import { Auth, type Session } from './auth';
import { Compose, emptyDraft, type Draft } from './compose';
import { Account } from './account';
import { usePreferences } from '../host/providers';
import { useSessionPreferences } from '../host/session-preferences';
import { Brand, AccountMenu, FolderNav, MessageList, MailDetail, MailIcon, EmptyState, boxLabel, messageText, type Box, type Message, type Detail } from './mail-ui';
export function Workspace({ surface }: {
    surface: 'mail' | 'account';
}) {
    const [session, setSession] = useState<Session | null>(null), [checking, setChecking] = useState(true), [notice, setNotice] = useState('');
    const [boxes, setBoxes] = useState<Box[]>([]), [selected, setSelected] = useState(''), [messages, setMessages] = useState<Message[]>([]), [detail, setDetail] = useState<Detail | null>(null);
    const [search, setSearch] = useState(''), [position, setPosition] = useState(0), [total, setTotal] = useState(0), [checked, setChecked] = useState<string[]>([]), [revision, setRevision] = useState(0), [draft, setDraft] = useState<Draft | null>(null);
    const [foldersOpen, setFoldersOpen] = useState(false), [manageOpen, setManageOpen] = useState(false), [folderName, setFolderName] = useState(''), [deleting, setDeleting] = useState(false);
    const [listLoading, setListLoading] = useState(true), [listError, setListError] = useState(''), [reading, setReading] = useState(false), [readError, setReadError] = useState(''), [activeId, setActiveId] = useState(''), [pending, setPending] = useState(false);
    const generation = useRef(0), readRequest = useRef(0), listRequest = useRef(0), pendingRef = useRef(false), initialized = useRef(false);
    const [split,setSplit]=useState(false);
    const listBusy=useDelayedBusy(listLoading),readerBusy=useDelayedBusy(reading);
    const {scrollRef,contentRef,canScrollDown,scrollDown}=useScrollHint(Boolean(session)&&surface==='mail'&&!listError&&messages.length>0,selected+':'+search+':'+position+':'+messages.map(m=>m.id).join(','));
    const lastOpened=useRef('');
    useEffect(()=>{if(!session)return;try{setSplit(localStorage.getItem('mail-layout:'+session.id)==='split');}catch{}},[session?.id]);
    function toggleLayout(){setSplit(value=>{const next=!value;try{localStorage.setItem('mail-layout:'+session!.id,next?'split':'list');}catch{}return next;});}
    useSessionPreferences(session?.email);
    const refresh = () => setRevision(r => r + 1);
    function clear() { generation.current++; readRequest.current++; listRequest.current++; usePreferences.getState().setTheme('system'); setSession(null); setBoxes([]); setMessages([]); setDetail(null); setDraft(null); setChecked([]); setNotice(''); setSearch(''); setSelected(''); setActiveId(''); setReading(false); setReadError(''); setListError(''); setListLoading(true); setFoldersOpen(false); setManageOpen(false); initialized.current = false; if (location.pathname === '/')
        history.replaceState(null, '', '/'); }
    function failure(error: unknown) { if (error instanceof ApiError && error.status === 401) {
        clear();
        setNotice('登录已过期，请重新登录');
    }
    else
        setNotice(errorMessage(error)); }
    function updateRoute(id?: string, box = selected, query = search, offset = position) { const params = new URLSearchParams({ mailbox: box }); if (query)
        params.set('search', query); if (offset)
        params.set('position', String(offset)); if (id)
        params.set('message', id); history.replaceState(null, '', '/?' + params); }
    function closeReader() { readRequest.current++; setReading(false); setReadError(''); setDetail(null); setActiveId(''); updateRoute(); requestAnimationFrame(() => (document.querySelector<HTMLButtonElement>('[data-message-id="'+CSS.escape(lastOpened.current)+'"]')??document.getElementById('mail-list-heading'))?.focus()); }
    function selectBox(id: string) { listRequest.current++; readRequest.current++; setSelected(id); setPosition(0); setSearch(''); setChecked([]); setDetail(null); setActiveId(''); setReadError(''); setReading(false); setMessages([]); setListLoading(true); setFoldersOpen(false); updateRoute(undefined, id, '', 0); }
    function changeSearch(value: string) { listRequest.current++; readRequest.current++; setSearch(value); setPosition(0); setChecked([]); setDetail(null); setActiveId(''); setReading(false); setReadError(''); setMessages([]); setListLoading(true); updateRoute(undefined, selected, value, 0); }
    function changePage(offset: number) { listRequest.current++; closeReader(); setChecked([]); setPosition(offset); setMessages([]); setListLoading(true); updateRoute(undefined, selected, search, offset); }
    useEffect(() => { let active = true; void api<Session>('/auth/session').then(s => { if (active)
        setSession(s); }).catch(() => { }).finally(() => { if (active)
        setChecking(false); }); return () => { active = false; }; }, []);
    useEffect(() => { if (!session || surface !== 'mail')
        return; let active = true; const epoch = generation.current; void api<{
        list: Box[];
    }>('/mailboxes').then(r => { if (!active || epoch !== generation.current)
        return; setBoxes(r.list); if (!initialized.current) {
        initialized.current = true;
        const params = new URLSearchParams(location.search), requested = params.get('mailbox');
        const id = r.list.find(b => b.id === requested)?.id ?? r.list.find(b => b.role === 'inbox')?.id ?? r.list[0]?.id ?? '';
        setSelected(id);
        setSearch(params.get('search') ?? '');
        const offset = Number(params.get('position') ?? 0);
        setPosition(Number.isFinite(offset) ? Math.max(0, Math.floor(offset / 50) * 50) : 0);
        if (params.get('message'))
            void read(params.get('message')!, id, params.get('search') ?? '', Number.isFinite(offset) ? Math.max(0, Math.floor(offset / 50) * 50) : 0);
        if (!id)
            setListLoading(false);
    } }).catch(error => { if (active) {
        setListLoading(false);
        setListError(errorMessage(error));
        failure(error);
    } }); return () => { active = false; }; }, [session, surface, revision]);
    useEffect(() => { if (!session || !selected || surface !== 'mail')
        return; let active = true; const request = ++listRequest.current; setListLoading(true); setListError(''); const timer = setTimeout(() => { const params = new URLSearchParams({ mailbox: selected, search, position: String(position) }); void api<{
        items: Message[];
        total: number;
    }>('/messages?' + params).then(r => { if (active && request === listRequest.current) {
        setMessages(r.items);
        setTotal(r.total);
        setChecked(ids => ids.filter(id => r.items.some(m => m.id === id)));
    } }).catch(error => { if (active && request === listRequest.current) {
        setListError(errorMessage(error));
        failure(error);
    } }).finally(() => { if (active && request === listRequest.current)
        setListLoading(false); }); }, search ? 250 : 0); return () => { active = false; clearTimeout(timer); }; }, [session, selected, search, position, revision, surface]);
    useEffect(() => { if (!session || surface !== 'mail')
        return; const events = new EventSource('/api/v1/events'); let timer: ReturnType<typeof setTimeout> | undefined; events.addEventListener('sync', () => { if (timer)
        clearTimeout(timer); timer = setTimeout(refresh, 600); }); events.addEventListener('session-expired', clear); events.onerror = () => { void api<Session>('/auth/session').catch(error => { if (error instanceof ApiError && error.status === 401)
        clear(); }); }; return () => { events.close(); if (timer)
        clearTimeout(timer); }; }, [session, surface]);
    async function read(id: string, box = selected, query = search, offset = position) { const epoch = generation.current, request = ++readRequest.current; lastOpened.current=id; setActiveId(id); setDetail(null); setReading(true); setReadError(''); setNotice(''); updateRoute(id, box, query, offset); try {
        const result = await api<Detail>('/messages/' + encodeURIComponent(id));
        if (epoch !== generation.current || request !== readRequest.current)
            return;
        setDetail(result);
        setReading(false);
        requestAnimationFrame(() => document.getElementById('message-detail')?.focus());
        const previous=messages.find(m=>m.id===id)?.keywords;
        setMessages(items=>items.map(m=>m.id===id?{...m,keywords:{...m.keywords,$seen:true}}:m));
        try{await api('/messages/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ read: true }) });}catch(error){if(epoch===generation.current){setMessages(items=>items.map(m=>m.id===id&&previous?{...m,keywords:previous}:m));failure(error);}return;}
        if (epoch === generation.current && request === readRequest.current) {
            setMessages(items => items.map(m => m.id === id ? { ...m, keywords: { ...m.keywords, $seen: true } } : m));
            refresh();
        }
    }
    catch (error) {
        if (epoch === generation.current && request === readRequest.current) {
            setReading(false);
            setReadError(errorMessage(error));
            failure(error);
        }
    } }
    async function batch(patch: Record<string, unknown>, ids = checked) { if (pendingRef.current || !ids.length)
        return; pendingRef.current = true; setPending(true); const epoch = generation.current; const originals=messages.filter(m=>ids.includes(m.id));
        if('starred' in patch||'read' in patch)setMessages(items=>items.map(m=>ids.includes(m.id)?{...m,keywords:{...m.keywords,...('starred' in patch?{$flagged:Boolean(patch.starred)}:{}),...('read' in patch?{$seen:Boolean(patch.read)}:{})}}:m));
        try {
        await api('/messages/batch', { method: 'POST', body: JSON.stringify({ ids, ...patch }) });
        if (epoch !== generation.current)
            return;
        if(!('starred' in patch))setChecked([]);
        if (patch.mailbox && ids.includes(activeId))
            closeReader();
        setNotice(patch.mailbox ? '邮件已移动' : '邮件已更新');
        refresh();
    }
    catch (error) {
        if (epoch === generation.current){setMessages(items=>items.map(m=>originals.find(old=>old.id===m.id)??m));failure(error);}
    }
    finally {
        pendingRef.current = false;
        setPending(false);
    } }
    function reply(message: Detail, forward = false) { setDraft({ ...emptyDraft(), to: forward ? [] : message.from.map(a => a.email), subject: (forward ? 'Fwd: ' : 'Re: ') + message.subject, text: '\n\n—— ' + message.from.map(a => a.email).join(', ') + ' ——\n' + messageText(message), in_reply_to: forward ? undefined : message.messageId, references: forward ? undefined : [...(message.references ?? []), ...(message.messageId ?? [])], attachments: forward ? (message.attachments ?? []).map(a => ({ blob_id: a.blobId, name: a.name ?? 'attachment', type: a.type })) : [] }); }
    async function folderWork(kind: 'create' | 'rename' | 'delete') { if (pendingRef.current)
        return; pendingRef.current = true; setPending(true); try {
        await api(kind === 'create' ? '/mailboxes' : '/mailboxes/' + encodeURIComponent(selected), { method: kind === 'create' ? 'POST' : kind === 'rename' ? 'PATCH' : 'DELETE', ...(kind === 'delete' ? {} : { body: JSON.stringify({ name: folderName.trim() }) }) });
        if (kind === 'delete') {
            initialized.current = false;
            selectBox('');
        }
        setFolderName('');
        setManageOpen(false);
        refresh();
    }
    catch (error) {
        failure(error);
        throw error;
    }
    finally {
        pendingRef.current = false;
        setPending(false);
    } }
    if (checking)
        return <main className="app-loading" role="status"><Brand /><p>正在连接你的邮箱…</p></main>;
    if (!session)
        return <><Auth onLogin={setSession}/>{notice && <p role="alert">{notice}</p>}</>;
    const currentBox = boxes.find(b => b.id === selected);
    const nav = <FolderNav boxes={boxes} selected={selected} onSelect={selectBox} onCompose={() => { setDraft(current => current ?? emptyDraft()); setFoldersOpen(false); }} onManage={() => { setManageOpen(true); setFoldersOpen(false); }}/>;
    return <div onKeyDown={e=>{if(e.key==='Escape'&&activeId&&!draft&&!e.defaultPrevented&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)&&!document.querySelector('[role="dialog"],[role="alertdialog"]')){e.preventDefault();closeReader();}}} className={'mail-app' + (activeId ? ' has-reader' : '') + (draft ? ' has-compose' : '')+(split?' is-split':' is-list')}>
  <a href="#mail-main" className="skip-link">跳至主要内容</a>
  <header className="mail-header">{surface==='mail'&&<div className="mobile-folders"><IconAction variant="quiet" size="sm" tooltip label="打开文件夹" onPress={() => setFoldersOpen(true)}><MailIcon name="menu"/></IconAction></div>}<Brand />{surface === 'mail' && <div className="header-search"><SearchBox label="搜索邮件" placeholder="搜索邮件" value={search} onValueChange={changeSearch}/></div>}<AccountMenu session={session} onLogout={() => void api('/auth/logout', { method: 'POST' }).then(clear).catch(failure)}/></header>
  {notice && <div className="app-notice" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={() => setNotice('')}><MailIcon name="close" size={16}/></button></div>}
  {surface === 'account' ? <div className="account-scroll"><Account onExpired={clear}/></div> : <main id="mail-main" className="mail-layout">
   <aside className="mail-sidebar">{nav}</aside>
   <section className="mail-list screen-enter" aria-label="邮件列表">
    <div className="mobile-search"><SearchBox label="搜索邮件" placeholder="搜索当前文件夹" value={search} onValueChange={changeSearch}/></div>
<div className="list-toolbar"><span className="select-all"><CheckboxField indeterminate={checked.length>0&&checked.length<messages.length} label="全选当前页邮件" labelVisibility="screen-reader" disabled={!messages.length||pending||listLoading} checked={messages.length>0&&checked.length===messages.length} onCheckedChange={v=>setChecked(v?messages.map(m=>m.id):[])}/></span>
{checked.length?<div className="batch-tools"><span className="selected-count">{checked.length} 封</span><IconAction variant="quiet" size="sm" tooltip label="标记已读" disabled={pending} onPress={()=>void batch({read:true})}><MailIcon name="mail"/></IconAction><IconAction variant="quiet" size="sm" tooltip label="归档已选邮件" disabled={pending||!boxes.some(b=>b.role==='archive')} onPress={()=>void batch({mailbox:boxes.find(b=>b.role==='archive')?.id})}><MailIcon name="archive"/></IconAction><IconAction variant="quiet" size="sm" tooltip label="移入回收站" disabled={pending||!boxes.some(b=>b.role==='trash')} onPress={()=>void batch({mailbox:boxes.find(b=>b.role==='trash')?.id})}><MailIcon name="trash"/></IconAction><MenuButton variant="quiet" label={<MailIcon name="folder"/>} ariaLabel="移动已选邮件到文件夹" items={boxes.filter(b=>b.id!==selected).map(b=>({id:b.id,label:boxLabel(b),disabled:pending}))} onAction={id=>void batch({mailbox:id})}/><MenuButton variant="quiet" label={<MailIcon name="more"/>} ariaLabel="已选邮件操作" items={[{id:'unread',label:'标记未读',disabled:pending}]} onAction={()=>void batch({read:false})}/></div>:<><IconAction variant="quiet" size="sm" tooltip label="刷新邮件" loading={listLoading} onPress={refresh}><MailIcon name="refresh"/></IconAction><h1 id="mail-list-heading" tabIndex={-1}>{boxLabel(currentBox)}</h1></>}
<div className="toolbar-end"><span className="page-range">{total?`${position+1}–${Math.min(position+50,total)} / ${total}`:'0 / 0'}</span><IconAction variant="quiet" size="sm" tooltip label="上一页" disabled={!position||listLoading} onPress={()=>changePage(Math.max(0,position-50))}><MailIcon name="left"/></IconAction><IconAction variant="quiet" size="sm" tooltip label="下一页" disabled={position+50>=total||listLoading} onPress={()=>changePage(position+50)}><MailIcon name="right"/></IconAction><span className="desktop-layout-toggle"><IconAction variant="quiet" size="sm" tooltip label={split?'切换到完整列表':'开启分栏阅读'} active={split} onPress={toggleLayout}><MailIcon name={split?'layout':'split'}/></IconAction></span><span className="mobile-compose"><IconAction variant="quiet" tooltip label="写新邮件" onPress={()=>setDraft(current=>current??emptyDraft())}><MailIcon name="edit"/></IconAction></span></div></div>
    <div className="list-scroll-frame"><div ref={scrollRef} className="list-scroll" tabIndex={0} role="region" aria-label="邮件列表内容" aria-busy={listLoading}><div ref={contentRef} className="list-scroll-content">{listError ? <div className="load-error" role="alert"><EmptyState title="无法加载邮件" description={listError}/><Action variant="secondary" onPress={refresh}>重新加载</Action></div> : listBusy && !messages.length ? <div className="list-skeleton" role="status">正在加载邮件…{[1, 2, 3, 4, 5].map(i => <div key={i}><span /><span /><span /></div>)}</div> : listLoading && !messages.length ? <div className="loading-reserve"/> : messages.length ? <ContentSwapTransition initialChange contentKey={selected+':'+search+':'+position}><MessageList messages={messages} activeId={activeId} checked={checked} pending={pending || listLoading} onCheck={(id, v) => setChecked(ids => v ? [...ids, id] : ids.filter(item => item !== id))} onRead={id => void read(id)} onStar={m => void batch({ starred: !m.keywords.$flagged }, [m.id])}/></ContentSwapTransition> : <EmptyState title={search ? '没有找到邮件' : '这里还没有邮件'} description={search ? '试试其他关键词，或清除搜索。' : '收到的邮件会出现在这里。'} icon="inbox"/>}</div></div><div className="list-scroll-hint" aria-hidden={!canScrollDown} data-visible={canScrollDown}><IconAction variant="quiet" size="sm" label="向下查看更多邮件" disabled={!canScrollDown} onPress={scrollDown}><MailIcon name="down" size={18}/></IconAction></div></div>
   </section>
   <article id="message-detail" tabIndex={-1} aria-label="邮件内容" className="mail-reader screen-enter">{reading || readError ? <><div className="reader-toolbar"><IconAction variant="quiet" size="sm" tooltip label="返回邮件列表" onPress={closeReader}><MailIcon name="left"/></IconAction></div><div className="load-error" role={readError ? 'alert' : 'status'}>{(readError||readerBusy)&&<EmptyState title={readError ? '无法打开邮件' : '正在打开邮件…'} description={readError || '正在获取邮件内容。'}/>}{readError && <Action variant="secondary" onPress={() => void read(activeId)}>重试</Action>}</div></> : <div className="reader-content"><ContentSwapTransition initialChange={Boolean(detail)} contentKey={detail?.id??'empty'}><MailDetail onArchive={detail&&boxes.some(b=>b.role==='archive')?()=>void batch({mailbox:boxes.find(b=>b.role==='archive')!.id},[detail.id]):undefined} onTrash={detail&&boxes.some(b=>b.role==='trash')?()=>void batch({mailbox:boxes.find(b=>b.role==='trash')!.id},[detail.id]):undefined} onUnread={()=>{if(detail)void batch({read:false},[detail.id]);}} detail={detail} onBack={closeReader} onReply={forward => detail && reply(detail, forward)} onEdit={() => detail && setDraft({ ...emptyDraft(), id: detail.id, to: detail.to?.map(a => a.email) ?? [], cc: detail.cc?.map(a => a.email) ?? [], bcc: detail.bcc?.map(a => a.email) ?? [], subject: detail.subject, text: messageText(detail), attachments: (detail.attachments ?? []).map(a => ({ blob_id: a.blobId, name: a.name ?? 'attachment', type: a.type })) })} onCheckSubmission={() => detail?.submission && void api<{
            status: string;
        }>('/submissions/' + detail.submission.operationId).then(r => setNotice(['submitted', 'succeeded'].includes(r.status) ? '服务器已接受邮件，尚不代表收件人已收到' : '发送结果尚未确认，请稍后核对，避免重复发送')).catch(failure)}/></ContentSwapTransition></div>}</article>
   {draft && <div className="compose-workspace"><Compose initial={draft} onClose={() => { setDraft(null); refresh(); }}/></div>}
  </main>}
  <DrawerSurface triggerLabel="文件夹" title="我的邮箱" description="选择文件夹" closeLabel="关闭文件夹" placement="left" composition="navigation" isOpen={foldersOpen} onOpenChange={setFoldersOpen}>{nav}</DrawerSurface>
  <DrawerSurface triggerLabel="管理文件夹" title="管理文件夹" description={`当前文件夹：${boxLabel(currentBox)}`} closeLabel="关闭文件夹管理" isOpen={manageOpen} onOpenChange={v => { if (!pending)
        setManageOpen(v); }}><div className="drawer-form"><TextField label="文件夹名称" value={folderName} onChange={e => setFolderName(e.target.value)} disabled={pending}/><Action disabled={pending || !folderName.trim()} onPress={() => void folderWork('create').catch(() => { })}>新建文件夹</Action>{currentBox && currentBox.role == null && <><Action variant="secondary" disabled={pending || !folderName.trim()} onPress={() => void folderWork('rename').catch(() => { })}>重命名当前文件夹</Action><Action variant="quiet" disabled={pending} onPress={() => setDeleting(true)}>删除当前空文件夹</Action></>}{notice && <p role="alert">{notice}</p>}</div></DrawerSurface>
  <ConfirmDialog triggerLabel="删除文件夹" title="删除空文件夹？" description={boxLabel(currentBox)} impact="只有空文件夹可以删除。此操作不可撤销。" cancelLabel="取消" confirmLabel="删除文件夹" failureMessage="删除失败，请确认文件夹为空后重试。" tone="danger" isOpen={deleting} onOpenChange={setDeleting} onConfirm={() => folderWork('delete')}/>
 </div>;
}

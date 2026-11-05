'use client';
import Link from 'next/link';
import { Action } from '@community-go/ui-adapter/action';
import { IconAction } from '@community-go/ui-adapter/icon-action';
import { CheckboxField } from '@community-go/ui-adapter/form-field';
import { MenuButton } from '@community-go/ui-adapter/menu-button';
import type { Session } from './auth';
import {useSiteSettings} from '../host/site-settings';
export type Box = {
    id: string;
    name: string;
    role: string | null;
    unreadEmails: number;
};
type Address = {
    email: string;
    name?: string;
};
export type Message = {
    id: string;
    subject: string;
    preview: string;
    from: Address[];
    to: Address[];
    cc: Address[];
    bcc: Address[];
    keywords: Record<string, boolean>;
    receivedAt: string;
};
export type Detail = Message & {
    submission?: {
        operationId: string;
        status: string;
    };
    textBody: {
        partId: string;
    }[];
    bodyValues: Record<string, {
        value: string;
    }>;
    safeHtml?: string;
    plainText?: string;
    messageId?: string[];
    references?: string[];
    attachments: {
        blobId: string;
        name: string;
        type: string;
        size: number;
    }[];
};
export const roles: Record<string, string> = { inbox: '收件箱', sent: '已发送', drafts: '草稿箱', junk: '垃圾邮件', trash: '回收站', archive: '归档' };
export const boxLabel = (box?: Box) => box ? roles[box.role ?? ''] ?? box.name : '邮箱';
export function messageText(m: Detail) { return m.plainText ?? m.textBody?.map(p => m.bodyValues?.[p.partId]?.value ?? '').join('\n') ?? ''; }
const paths: Record<string, string> = {down:'m5 9 7 7 7-7',logout:'M9 4H3v16h6 M14 7l5 5-5 5 M7 12h12',split:'M3 4h18v16H3z M10 4v16',layout:'M3 4h18v16H3z M3 9h18 M3 14h18', mail: 'M3 5h18v14H3z M3 6l9 7 9-7', inbox: 'M4 4h16l2 12v4H2v-4L4 4z M2 15h6l2 3h4l2-3h6', sent: 'm3 3 19 9-19 9 4-9-4-9z M7 12h15', drafts: 'M14 3H5v18h14V8z M14 3v6h5 M8 13h8 M8 17h5', archive: 'M3 3h18v5H3z M5 8v13h14V8 M10 12h4', junk: 'm12 2 10 18H2L12 2z M12 8v5 M12 16v1', trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7', folder: 'M3 6h7l2 2h9v12H3z', plus: 'M12 5v14 M5 12h14', refresh: 'M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 13-3l2 3 M4 16l2 3a8 8 0 0 0 13-3', left: 'm14 5-7 7 7 7', right: 'm10 5 7 7-7 7', star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z', reply: 'm9 5-7 6 7 6 M2 11h11a8 8 0 0 1 8 8', forward: 'm15 5 7 6-7 6 M22 11H11a8 8 0 0 0-8 8', clip: 'm8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2', menu: 'M4 6h16 M4 12h16 M4 18h16', more: 'M5 12h.01 M12 12h.01 M19 12h.01', settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6', grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', users: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M13 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4 M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', activity: 'M3 12h4l3-8 4 16 3-8h4', check: 'm5 12 4 4L19 6', close: 'm6 6 12 12 M6 18 18 6', edit: 'm15 4 5 5 M4 20l5-1L21 7l-5-5L4 14z' };
export function MailIcon({ name, size = 20 }: {
    name: string;
    size?: number;
}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.folder}/></svg>; }
export function Brand({ admin = false }: {
    admin?: boolean;
}) { const brand=useSiteSettings(state=>state.brand);return <Link href={admin ? '/admin/' : '/'} className="product-brand"><span className="brand-mark"><MailIcon name="mail"/></span><span>{brand}{admin&&<span className="brand-sub"> · 管理</span>}</span></Link>; }
export function AccountMenu({ session, onLogout }: {
    session: Session;
    onLogout: () => void;
}) { return <MenuButton variant="quiet" ariaLabel="账号菜单" label={<span className="account-trigger"><span className="avatar avatar-small">{session.email[0].toUpperCase()}</span><span className="account-email">{session.email}</span></span>} groups={[{id:'navigation',label:'',items:[{id:'account',label:'个人设置',icon:<MailIcon name="settings" size={16}/>},{id:'mail',label:'返回邮箱',icon:<MailIcon name="inbox" size={16}/>},...(session.operator?[{id:'admin',label:'平台运营',icon:<MailIcon name="grid" size={16}/>},{id:'setup',label:'站点配置',icon:<MailIcon name="settings" size={16}/>}]:[])]},{id:'session',label:'',items:[{id:'logout',label:'退出登录',icon:<MailIcon name="logout" size={16}/>}]}]} onAction={id => { if (id === 'logout')
    onLogout();
else
    location.assign(id === 'account' ? '/account/' : id === 'admin' ? '/admin/' : id==='setup'?'/setup/':'/'); }}/>; }
export function EmptyState({ title, description, icon = 'mail' }: {
    title: string;
    description: string;
    icon?: string;
}) { return <div className="empty-state"><span className="empty-icon"><MailIcon name={icon} size={30}/></span><h2>{title}</h2><p>{description}</p></div>; }
const folderOrder:Record<string,number>={inbox:0,sent:1,drafts:2,archive:3,junk:4,trash:5};
export function FolderNav({ boxes, selected, onSelect, onCompose, onManage }: {
    boxes: Box[];
    selected: string;
    onSelect: (id: string) => void;
    onCompose: () => void;
    onManage: () => void;
}) { const brand=useSiteSettings(state=>state.brand);return <div className="folder-content"><Action fullWidth leadingIcon={<MailIcon name="edit"/>} onPress={onCompose}>写邮件</Action><p className="nav-eyebrow">我的邮箱</p><nav aria-label="邮箱文件夹">{[...boxes].sort((a,b)=>(folderOrder[a.role??""]??6)-(folderOrder[b.role??""]??6)).map(b => <button type="button" key={b.id} className={'folder-link' + (selected === b.id ? ' is-current' : '')} aria-current={selected === b.id ? 'page' : undefined} onClick={() => onSelect(b.id)}><MailIcon name={b.role ?? 'folder'}/><span>{boxLabel(b)}</span>{b.unreadEmails > 0 && <span className="unread-count">{b.unreadEmails}</span>}</button>)}</nav><button className="folder-manage" type="button" onClick={onManage}><MailIcon name="settings" size={17}/>管理文件夹</button><div className="sidebar-footer"><span className="sidebar-rule"/><span>{brand}</span><small>让沟通，井井有条。</small></div></div>; }
function shortDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date); }
export function MessageList({ messages, activeId, checked, onCheck, onRead, onStar, pending }: {
    messages: Message[];
    activeId: string;
    checked: string[];
    onCheck: (id: string, checked: boolean) => void;
    onRead: (id: string) => void;
    onStar: (m: Message) => void;
    pending: boolean;
}) { return <div className="message-rows">{messages.map(m=><div key={m.id} className={'message-row'+(activeId===m.id?' is-active':'')+(!m.keywords.$seen?' is-unread':'')}>
<div className="row-check"><CheckboxField label={`选择 ${m.subject||'无主题邮件'}`} labelVisibility="screen-reader" checked={checked.includes(m.id)} disabled={pending} onCheckedChange={v=>onCheck(m.id,v)}/></div>
<button type="button" className={'row-star'+(m.keywords.$flagged?' is-starred':'')} title={m.keywords.$flagged?'取消星标':'星标'} aria-label={`${m.keywords.$flagged?'取消星标':'星标'}：${m.subject}`} aria-pressed={!!m.keywords.$flagged} disabled={pending} onClick={()=>onStar(m)}><MailIcon name="star" size={18}/></button>
<button type="button" data-message-id={m.id} className="message-open" aria-current={activeId===m.id?'true':undefined} onClick={()=>onRead(m.id)}><span className="row-sender">{m.from?.[0]?.name||m.from?.[0]?.email||'未知发件人'}</span><span className="row-content"><span className="row-subject">{m.subject||'（无主题）'}</span><span className="row-preview"> — {m.preview||'无邮件摘要'}</span></span><time className="row-time" dateTime={m.receivedAt}>{shortDate(m.receivedAt)}</time></button>
</div>)}</div>; }

export function MailDetail({ detail, onBack, onReply, onEdit, onCheckSubmission,onArchive,onTrash,onUnread }: {
    detail: Detail | null;
    onBack: () => void;
    onReply: (forward: boolean) => void;
    onEdit: () => void;
    onCheckSubmission: () => void; onArchive?:()=>void;onTrash?:()=>void;onUnread:()=>void;
}) {
    return <><div className="reader-toolbar"><div className="reader-back always-visible"><IconAction variant="quiet" size="sm" tooltip label="返回邮件列表" onPress={onBack}><MailIcon name="left"/></IconAction></div><span className="reader-caption">邮件内容</span>{detail && <div className="reader-actions"><IconAction variant="quiet" size="sm" tooltip label="归档邮件" disabled={!onArchive} onPress={()=>onArchive?.()}><MailIcon name="archive"/></IconAction><IconAction variant="quiet" size="sm" tooltip label="移入回收站" disabled={!onTrash} onPress={()=>onTrash?.()}><MailIcon name="trash"/></IconAction><IconAction variant="quiet" size="sm" tooltip label="标记未读" onPress={onUnread}><MailIcon name="mail"/></IconAction><IconAction variant="quiet" size="sm" tooltip label="回复邮件" onPress={() => onReply(false)}><MailIcon name="reply"/></IconAction><IconAction variant="quiet" size="sm" tooltip label="转发邮件" onPress={() => onReply(true)}><MailIcon name="forward"/></IconAction></div>}</div>{!detail ? <EmptyState title="选择一封邮件" description="在邮件列表中选择邮件，在这里开始阅读。"/> : <div className="reader-scroll"><div className="reader-document"><div className="reader-subject-line"><h1>{detail.subject || '（无主题）'}</h1></div><div className="sender-card"><span className="avatar">{(detail.from?.[0]?.name || detail.from?.[0]?.email || '?')[0].toUpperCase()}</span><div className="sender-meta"><strong>{detail.from?.[0]?.name || detail.from?.[0]?.email}</strong><details className="address-details"><summary>查看收件详情</summary><span>{detail.from.map(a => a.email).join(', ')}</span><span>收件人：{detail.to?.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ') || '—'}</span>{detail.cc?.length > 0 && <span>抄送：{detail.cc.map(a => a.email).join(', ')}</span>}{detail.bcc?.length > 0 && <span>密送：{detail.bcc.map(a => a.email).join(', ')}</span>}</details><time dateTime={detail.receivedAt}>{new Date(detail.receivedAt).toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' })}</time></div></div>{detail.submission && <div className="inline-notice"><p>这封邮件已有发送记录，请先核对结果，避免重复发送。</p><Action size="sm" variant="secondary" onPress={onCheckSubmission}>检查发送结果</Action></div>}{detail.safeHtml ? <iframe title="邮件正文（已隔离）" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" className="mail-html" srcDoc={'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; style-src &apos;unsafe-inline&apos;"><meta charset="utf-8"><meta name="color-scheme" content="light dark"><style>body{font:14px/1.7 system-ui,sans-serif;overflow-wrap:anywhere;color:CanvasText;background:Canvas;margin:0}a{color:LinkText}</style>' + detail.safeHtml}/> : <div className="mail-body">{messageText(detail)}</div>}{detail.attachments?.length > 0 && <div className="attachment-section"><h3><MailIcon name="clip" size={16}/>{detail.attachments.length} 个附件</h3>{detail.attachments.map(a => <div className="attachment-card" key={a.blobId}><MailIcon name="drafts"/><a href={'/api/v1/attachments/' + encodeURIComponent(a.blobId) + '?' + new URLSearchParams({ message: detail.id })}><strong>{a.name}</strong><small>{Math.ceil(a.size / 1024)} KiB · 下载</small></a>{['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(a.type) && <a target="_blank" rel="noopener noreferrer" href={'/api/v1/attachments/' + encodeURIComponent(a.blobId) + '?' + new URLSearchParams({ message: detail.id, preview: 'true' })}>预览</a>}</div>)}</div>}<div className="reader-bottom-actions"><Action variant="secondary" leadingIcon={<MailIcon name="reply"/>} onPress={() => onReply(false)}>回复</Action><Action variant="quiet" leadingIcon={<MailIcon name="forward"/>} onPress={() => onReply(true)}>转发</Action>{detail.keywords.$draft && !detail.submission && <Action variant="secondary" onPress={onEdit}>继续编辑草稿</Action>}</div></div></div>}</>;
}

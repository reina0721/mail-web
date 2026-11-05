'use client';
import {IconAction} from '@community-go/ui-adapter/icon-action';
import { MailIcon, EmptyState } from './mail-ui';
export type User = {
    id: string;
    email: string;
    status: string;
    operator: boolean;
    quotaBytes: number;
    hourlyRecipients: number;
    dailyRecipients: number;
};
export type Audit = {
    id: string;
    actorId: string | null;
    subjectId: string | null;
    action: string;
    outcome: string;
    createdAt: number;
};
export const states: Record<string, string> = { active: '正常', disabled: '已停用', provisioning: '开户待恢复', reconcile: '待核对' };
const actions: Record<string, string> = { 'account.update': '更新账号策略', 'registration.update': '更新注册策略', 'task.retry': '重试失败任务' };
export function Status({ status }: {
    status: string;
}) { return <span className={'status-badge ' + (status === 'active' || status === 'success' ? 'status-good' : status === 'disabled' ? 'status-muted' : 'status-warn')}><span />{states[status] ?? (status === 'success' ? '成功' : status === 'queued' ? '已排队' : '待核对')}</span>; }
export function AuditList({ audit, users, limit }: {
    audit: Audit[];
    users: User[];
    limit?: number;
}) { const userName = (id: string | null) => users.find(u => u.id === id)?.email ?? (id ? '历史账号' : '系统'); return <div className="audit-list">{!audit.length ? <EmptyState title="暂无操作记录" description="管理操作的审计记录会显示在这里。" icon="activity"/> : audit.slice(0, limit).map(event => <div className="audit-row" key={event.id}><span className="audit-icon"><MailIcon name="activity" size={17}/></span><div><strong>{actions[event.action] ?? '账号操作'}</strong><p>{userName(event.actorId)} · {userName(event.subjectId)}</p><time>{new Date(event.createdAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><Status status={event.outcome}/></div>)}</div>; }
export function AccountTable({ items, onOpen }: {
    items: User[];
    onOpen: (u: User) => void;
}) { return <div className="account-table-wrap"><table className="account-table"><thead><tr><th>邮箱账号</th><th>状态</th><th>容量配额</th><th>发信限额</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{items.map(user => <tr key={user.id}><td><button className="user-identity" type="button" onClick={() => onOpen(user)}><span className="avatar avatar-small">{user.email[0].toUpperCase()}</span><span><strong>{user.email}</strong><small>{user.operator ? '运营账号' : '普通邮箱'}</small></span></button></td><td><Status status={user.status}/></td><td>{user.quotaBytes / 1048576} <span className="muted">MiB</span></td><td><span>{user.hourlyRecipients} / 小时</span><small className="cell-sub">{user.dailyRecipients} / 天</small></td><td><IconAction variant="quiet" size="sm" tooltip label={`管理 ${user.email}`} onPress={()=>onOpen(user)}><MailIcon name="edit" size={18}/></IconAction></td></tr>)}</tbody></table><div className="account-mobile-cards">{items.map(u => <button type="button" className="account-mobile-card" key={u.id} onClick={() => onOpen(u)}><span><strong>{u.email}</strong><small>{u.operator ? '运营账号' : '普通邮箱'} · {u.quotaBytes / 1048576} MiB</small><small>{u.hourlyRecipients}/小时 · {u.dailyRecipients}/天</small></span><Status status={u.status}/></button>)}</div></div>; }

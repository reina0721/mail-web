'use client';
import {MailIcon} from './mail-ui';
import { useEffect, useRef, useState } from 'react';
import { Action } from '@community-go/ui-adapter/action';
import { TextField, TextAreaField, FileField } from '@community-go/ui-adapter/form-field';
import { api, ApiError } from '../lib/api';
import {operationId} from '../host/operation-id';
import type { components } from '../lib/generated-api';
export type Draft = components['schemas']['Draft'];
export const emptyDraft = (): Draft => ({ to: [], cc: [], bcc: [], subject: '', text: '', attachments: [] });
export function Compose({ initial, onClose }: {
    initial: Draft;
    onClose: () => void;
}) {
    const [attachmentLimit, setAttachmentLimit] = useState(20971520);
    useEffect(() => { void api<{
        attachmentBytes: number;
    }>('/registration/policy').then(result => setAttachmentLimit(result.attachmentBytes || 20971520)).catch(() => { }); }, []);
    const [extra, setExtra] = useState(Boolean(initial.cc.length || initial.bcc.length));
    const [value, setValue] = useState(initial), [pending, setPending] = useState(false), [notice, setNotice] = useState(''), [submitted, setSubmitted] = useState(false);
    const idempotency = useRef(operationId()), operation = useRef('');
    function update(patch: Partial<Draft>) { if (!submitted) {
        setValue(current => ({ ...current, ...patch }));
        idempotency.current = operationId();
    } }
    async function run(operation: () => Promise<void>) { setPending(true); setNotice(''); try {
        await operation();
    }
    catch (error) {
        setNotice(error instanceof ApiError && error.status >= 400 && error.status < 500 ? '操作未完成，请核对输入后重试。若关闭时保存失败，请保留此编辑页面。' : '操作未完成。发送状态未知时请检查结果，不要重新创建同一封邮件。');
    }
    finally {
        setPending(false);
    } }
    async function save() { const result = await api<{
        id: string;
    }>('/drafts', { method: 'POST', body: JSON.stringify(value) }); setValue(current => ({ ...current, id: result.id })); setNotice('草稿已保存至邮箱'); }
    async function send() { setSubmitted(true); try {
        const result = await api<{
            id?: string;
            emailId?: string;
            operationId?: string;
            status: string;
        }>('/submissions', { method: 'POST', headers: { 'Idempotency-Key': idempotency.current }, body: JSON.stringify({ idempotency_key: idempotency.current, draft: value }) });
        operation.current = result.operationId ?? result.id ?? '';
        if (result.status === 'failed') {
            setSubmitted(false);
            if (result.emailId)
                setValue(current => ({ ...current, id: result.emailId }));
            idempotency.current = operationId();
            setNotice('邮件未被服务器接受。请核对收件人和发信限额，草稿仍保存在邮箱中。');
        }
        else
            setNotice((result.status === 'succeeded' || result.status === 'submitted') ? '服务器已接受邮件，尚不代表收件人已收到' : '提交结果待核对，请检查发送状态');
    }
    catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            setSubmitted(false);
            idempotency.current = operationId();
        }
        throw error;
    } }
    async function upload(file: File) { if (value.attachments.length >= 20)
        throw Error('attachment count'); const form = new FormData(); form.set('file', file); const result = await api<components['schemas']['UploadView']>('/attachments', { method: 'POST', body: form }); update({ attachments: [...value.attachments, { blob_id: result.blobId, name: file.name, type: result.type }] }); }
    const recipientRef = useRef<HTMLInputElement>(null);
    useEffect(() => { recipientRef.current?.focus(); }, []);
    const addresses = (text: string) => text.split(/[,;，；]/).map(s => s.trim()).filter(Boolean);
    return <section className="compose-panel" aria-label="邮件编辑器"><div className="compose-heading"><h2 className="text-xl font-semibold">写邮件</h2><Action variant="quiet" disabled={pending} onPress={() => void run(async () => { if (!submitted && (value.id || value.subject || value.text || value.to.length || value.cc.length || value.bcc.length || value.attachments.length)) {
        try {
            await save();
        }
        catch {
            setNotice('草稿保存失败，编辑内容已保留。请重试保存后再关闭。');
            return;
        }
    } onClose(); })}>返回邮箱</Action></div><div className="compose-fields"><TextField ref={recipientRef} label="收件人（逗号分隔）" value={value.to.join(', ')} disabled={pending || submitted} onChange={e => update({ to: addresses(e.target.value) })}/><div className="compose-extra"><Action size="sm" variant="quiet" onPress={() => setExtra(!extra)}>{extra ? '收起抄送 / 密送' : '添加抄送 / 密送'}</Action></div>{extra && <><TextField label="抄送" value={value.cc.join(', ')} disabled={pending || submitted} onChange={e => update({ cc: addresses(e.target.value) })}/><TextField label="密送" value={value.bcc.join(', ')} disabled={pending || submitted} onChange={e => update({ bcc: addresses(e.target.value) })}/></>}<TextField label="主题" value={value.subject} disabled={pending || submitted} onChange={e => update({ subject: e.target.value })}/><TextAreaField label="正文" rows={10} value={value.text} disabled={pending || submitted} onChange={e => update({ text: e.target.value })}/><FileField label="添加附件" hint={`每封附件合计最多 ${attachmentLimit / 1048576}MiB`} disabled={pending || submitted} onFile={file => void run(() => upload(file))}/>{value.attachments.map((a, index) => <div className="flex gap-2" key={`${a.blob_id}-${index}`}><span>{a.name}</span><Action variant="quiet" disabled={pending || submitted} onPress={() => update({ attachments: value.attachments.filter((_, i) => i !== index) })}>移除</Action></div>)}</div><div className="compose-actions"><Action leadingIcon={<MailIcon name="sent"/>} loading={pending} disabled={submitted || !value.to.length} onPress={() => void run(send)}>发送</Action><Action leadingIcon={<MailIcon name="drafts"/>} variant="secondary" disabled={pending || submitted} onPress={() => void run(save)}>保存草稿</Action>{submitted && !operation.current && <Action variant="quiet" onPress={() => void run(send)}>核对这次提交</Action>}{operation.current && <Action variant="quiet" onPress={() => void run(async () => { const result = await api<{
        status: string;
    }>('/submissions/' + operation.current); setNotice(`发送状态：${result.status}`); })}>检查发送结果</Action>}</div><p role="status" aria-live="polite">{notice}</p></section>;
}

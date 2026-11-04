'use client';
import {useEffect,useState} from 'react';
import {Action} from '@community-go/ui-adapter/action';
import {TextField} from '@community-go/ui-adapter/form-field';
import {formatDate} from '@community-go/i18n';
import {api,errorMessage} from '../lib/api';
import {contractClient,unwrapContract} from '../lib/contract-client';
import type {components} from '../lib/generated-api';

type Policy=components['schemas']['RegistrationPolicy'];
type User={id:string;email:string;status:string;operator:boolean;quotaBytes:number;hourlyRecipients:number;dailyRecipients:number};
type Tasks={accountPolicyJobs:number;credentialRevocations:number;registrationReconciliation:number};
type Audit={id:string;actorId:string|null;subjectId:string|null;action:string;outcome:string;createdAt:number};
const policyFields=[{key:'maximumAccounts',label:'普通邮箱总名额（最多 100）',scale:1},{key:'quotaBytes',label:'新邮箱容量（MiB）',scale:1048576},{key:'attachmentBytes',label:'每封附件合计（MiB，最多 20）',scale:1048576},{key:'hourlyRecipients',label:'新账号每小时外部收件人数',scale:1},{key:'dailyRecipients',label:'新账号每天外部收件人数',scale:1}] as const;
const states:Record<string,string>={active:'正常',disabled:'已停用',provisioning:'开户待恢复',reconcile:'需要核对归属'};
const actions:Record<string,string>={'account.update':'更新账号策略','registration.update':'更新注册策略','task.retry':'重试失败任务'};

export function Admin(){
 const[users,setUsers]=useState<User[]>([]),[policy,setPolicy]=useState<Policy|null>(null),[tasks,setTasks]=useState<Tasks|null>(null),[audit,setAudit]=useState<Audit[]>([]),[ready,setReady]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
 async function load(){
  const[u,p,t,a]=await Promise.all([api<{items:User[]}>('/admin/users'),api<{policy:Policy;dependenciesReady:boolean}>('/admin/registration'),api<Tasks>('/admin/tasks'),api<{items:Audit[]}>('/admin/audit')]);
  setUsers(u.items);setPolicy(p.policy);setReady(p.dependenciesReady);setTasks(t);setAudit(a.items);
 }
 useEffect(()=>{void load().catch(error=>setNotice(errorMessage(error)));},[]);
 async function run(work:()=>Promise<void>){setPending(true);setNotice('');try{await work();}catch(error){setNotice(errorMessage(error));}finally{setPending(false);}}
 function field(id:string,key:'quotaBytes'|'hourlyRecipients'|'dailyRecipients',value:string,scale=1){setUsers(items=>items.map(user=>user.id===id?{...user,[key]:Number(value)*scale}:user));}
 async function change(user:User,enabled:boolean){await api('/admin/users/'+user.id,{method:'PATCH',body:JSON.stringify({enabled,quota_bytes:user.quotaBytes,hourly_recipients:user.hourlyRecipients,daily_recipients:user.dailyRecipients})});await load();setNotice('策略已保存，正在同步邮件服务');}
 async function savePolicy(enabled:boolean){if(!policy)return;unwrapContract(await contractClient.PATCH('/api/v1/admin/registration',{body:{...policy,enabled}}));await load();setNotice('注册策略已保存');}
 const userName=(id:string|null)=>users.find(user=>user.id===id)?.email??(id?'历史账号':'系统');
 return <main className="mx-auto flex max-w-7xl flex-col gap-8 p-6">
  <h1 className="text-2xl font-semibold">平台运营</h1>
  <section className="flex flex-col gap-4" aria-labelledby="registration-heading">
   <h2 id="registration-heading" className="text-xl">注册与默认发信策略</h2>
   <p>运行配置：{ready?'已就绪':'尚未满足开放条件'} · 注册：{policy?.enabled?'已开放':'关闭'}</p>
   <p className="text-sm text-ink-muted">默认容量和发信限额仅应用于新账号；已有账号请在下方单独调整。</p>
   {policy&&<><div className="grid gap-4 md:grid-cols-2">{policyFields.map(item=><TextField key={item.key} label={item.label} value={String(policy[item.key]/item.scale)} disabled={pending} onChange={event=>setPolicy({...policy,[item.key]:Number(event.target.value)*item.scale})}/>)}</div>
    <div className="flex flex-wrap gap-3"><Action disabled={pending} onPress={()=>void run(()=>savePolicy(policy.enabled))}>保存默认策略</Action><Action variant="secondary" disabled={pending||(!ready&&!policy.enabled)} onPress={()=>void run(()=>savePolicy(!policy.enabled))}>{policy.enabled?'关闭注册':'开放注册'}</Action></div>
   </>}
  </section>
  <section aria-labelledby="users-heading"><h2 id="users-heading" className="mb-4 text-xl">邮箱账号</h2>
   <div className="grid gap-4 lg:grid-cols-2">{users.map(user=><article key={user.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-4">
    <h3 className="break-all font-semibold">{user.email}{user.operator?' · 运营账号':''}</h3><p>{states[user.status]??user.status}</p>
    <TextField label="容量（MiB）" value={String(user.quotaBytes/1048576)} disabled={pending} onChange={event=>field(user.id,'quotaBytes',event.target.value,1048576)}/>
    <TextField label="每小时外部收件人数" value={String(user.hourlyRecipients)} disabled={pending} onChange={event=>field(user.id,'hourlyRecipients',event.target.value)}/>
    <TextField label="每天外部收件人数" value={String(user.dailyRecipients)} disabled={pending} onChange={event=>field(user.id,'dailyRecipients',event.target.value)}/>
    {['active','disabled'].includes(user.status)?<div className="flex flex-wrap gap-2"><Action disabled={pending} onPress={()=>void run(()=>change(user,true))}>保存并启用</Action><Action variant="secondary" disabled={pending} onPress={()=>void run(()=>change(user,false))}>停用账号</Action></div>:<p className="text-sm text-ink-muted">需要用户重新验证外部邮箱并提交原开户密码。归属不明的邮箱须先核对目录记录。</p>}
   </article>)}</div>
  </section>
  <section className="flex flex-col gap-3" aria-labelledby="tasks-heading"><h2 id="tasks-heading" className="text-xl">后台同步任务</h2>
   <p>账号策略：{tasks?.accountPolicyJobs??0} · 待撤销凭据：{tasks?.credentialRevocations??0} · 待核对开户：{tasks?.registrationReconciliation??0}</p>
   <p className="text-sm text-ink-muted">失败的同步会自动重试。开户恢复需要用户再次验证和提交密码，不在后台保存密码。</p>
   <div><Action variant="secondary" disabled={pending} onPress={()=>void run(async()=>{const result=await api<{queued:number}>('/admin/tasks/retry',{method:'POST'});await load();setNotice(`已安排 ${result.queued} 项失败任务重新尝试`);})}>重试失败的同步任务</Action></div>
  </section>
  <section aria-labelledby="audit-heading"><h2 id="audit-heading" className="mb-3 text-xl">最近的审计记录</h2>
   {!audit.length&&<p className="text-ink-muted">暂无记录</p>}
   <ul className="flex flex-col gap-3">{audit.map(event=><li className="rounded-xl border border-border p-3" key={event.id}><p>{actions[event.action]??'账号操作'} · {event.outcome==='queued'?'已排队':event.outcome==='success'?'成功':'待核对'}</p><p className="break-all text-sm text-ink-muted">{formatDate('zh-CN',event.createdAt,{dateStyle:'medium',timeStyle:'short'})} · 操作人：{userName(event.actorId)} · 对象：{userName(event.subjectId)}</p></li>)}</ul>
  </section>
  <p role="status" aria-live="polite">{notice}</p>
 </main>;
}

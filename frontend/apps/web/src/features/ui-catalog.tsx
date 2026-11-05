'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Action } from '@community-go/ui-adapter/action';
import { IconAction } from '@community-go/ui-adapter/icon-action';
import { CheckboxField, ComboField, FileField, PasswordField, RadioGroupField, SelectField, SwitchField, TextAreaField, TextField } from '@community-go/ui-adapter/form-field';
import { DatePickerField } from '@community-go/ui-adapter/date-picker-field';
import { MenuButton } from '@community-go/ui-adapter/menu-button';
import { ConfirmDialog, DialogSurface, DrawerSurface, PopoverCard, TooltipAction } from '@community-go/ui-adapter/overlays';
import { CommandMenu } from '@community-go/ui-adapter/command-menu';
import { AlertBanner, Badge, NotificationCard } from '@community-go/ui-adapter/feedback';
import { FeedbackProvider } from '@community-go/ui-adapter/feedback-provider';
import { useFeedback } from '@community-go/ui-adapter/feedback-context';
import { FeedbackPresence } from '@community-go/ui-adapter/feedback-presence';
import { StatusPill } from '@community-go/ui-adapter/status-pill';
import { SearchBox } from '@community-go/ui-adapter/search-box';
import { Card, CardContent, CardFooter, CardHeader } from '@community-go/ui-adapter/card';
import { Panel } from '@community-go/ui-adapter/panel';
import { DataTable, TabsView } from '@community-go/ui-adapter/data-display';
import { DescriptionList } from '@community-go/ui-adapter/description-list';
import { Avatar, UserIdentity } from '@community-go/ui-adapter/identity';
import { BreadcrumbTrail, PaginationControl, TextLink } from '@community-go/ui-adapter/navigation';
import { StepNavigation } from '@community-go/ui-adapter/step-navigation';
import { NavigationFlyout, NavigationHint } from '@community-go/ui-adapter/navigation-flyout';
import { DisclosurePanel } from '@community-go/ui-adapter/disclosure';
import { ToggleGroup } from '@community-go/ui-adapter/toggle-group';
import { Tree } from '@community-go/ui-adapter/tree';
import { ProgressMeter } from '@community-go/ui-adapter/progress-meter';
import { Skeleton } from '@community-go/ui-adapter/skeleton';
import { BusyIndicator } from '@community-go/ui-adapter/busy-indicator';
import { AsyncRegion, type AsyncRegionPhase } from '@community-go/ui-adapter/async-region';
import { StateSurface } from '@community-go/ui-adapter/state-surface';
import { FormErrorSummary } from '@community-go/ui-adapter/form-error-summary';
import { ReadyImage } from '@community-go/ui-adapter/ready-image';
import { ContentSwapTransition } from '@community-go/ui-adapter/content-swap-transition';
import { LiveRegion, SkipLink } from '@community-go/ui-adapter/accessibility';
import { usePreferences } from '../host/providers';
import { useMotionPreview } from '../host/use-motion-preview';
import { MailIcon } from './mail-ui';

const families = ['buttons','forms','menus','overlays','feedback','surfaces','navigation','data'] as const;
type Family = typeof families[number];
const names: Record<Family,string> = {buttons:'按钮',forms:'表单',menus:'菜单',overlays:'浮层',feedback:'反馈',surfaces:'表面',navigation:'导航',data:'数据与异步状态'};
const noop = () => {};
const options = [{value:'one',label:'默认选项'},{value:'two',label:'较长的选项名称，用于检查窄屏显示'},{value:'disabled',label:'不可用选项',disabled:true}];
function Samples({title,children}:{title:string;children:ReactNode}) {
  return <section className="catalog-samples"><h2>{title}</h2><div className="catalog-sample-body">{children}</div></section>;
}
export function UiCatalog({family='buttons'}:{family?:Family}) {
  const [reduced,setReduced,slow,setSlow] = useMotionPreview();
  const theme = usePreferences(s=>s.theme), setTheme = usePreferences(s=>s.setTheme);
  return <FeedbackProvider closeLabel="关闭提示" loadingLabel="加载反馈"><SkipLink href="#catalog-content" label="跳到组件样例"/><main className="ui-catalog">
    <header><div><h1>共享组件规范 · {names[family]}</h1><p>独立交互样例，不连接业务接口。组件使用 HeroUI／React Aria，主题与几何规则在共享层统一。</p></div><div className="catalog-controls"><SelectField label="主题" presentation="toolbar" value={theme} onValueChange={setTheme} options={[{value:'light',label:'浅色'},{value:'dark',label:'深色'},{value:'system',label:'系统'}]}/><CheckboxField label="减少动态效果（仅此页）" checked={reduced} onCheckedChange={setReduced}/><CheckboxField label="四倍慢速检查（仅此页）" checked={slow} onCheckedChange={setSlow}/></div></header>
    <nav className="catalog-nav" aria-label="组件分类">{families.map(id=><a key={id} href={`/ui-elements/${id}/`} aria-current={id===family?'page':undefined}>{names[id]}</a>)}</nav><div id="catalog-content"><FamilySamples family={family}/></div>
  </main></FeedbackProvider>;
}
function FamilySamples({family}:{family:Family}) {
  const [checked,setChecked]=useState(false),[mixed,setMixed]=useState(true),[value,setValue]=useState('one'),[text,setText]=useState('');
  const [selected,setSelected]=useState<readonly string[]>(['one']),[page,setPage]=useState(1),[tab,setTab]=useState('one');
  const [open,setOpen]=useState(false),[visible,setVisible]=useState(true),[phase,setPhase]=useState<AsyncRegionPhase>('ready');
  const emailRef=useRef<HTMLInputElement>(null);
  const feedback=useFeedback(),icon=<MailIcon name="inbox"/>;
  const report=(id:string)=>{feedback.notify({title:`已操作：${id}`,tone:'info'});};
  if(family==='buttons') return <>
    <Samples title="官方按钮变体 · 默认、禁用、加载">{(['primary','secondary','quiet','danger'] as const).map(variant=><div className="catalog-row" key={variant}><Action variant={variant} leadingIcon={icon} onPress={()=>report(variant)}>{variant}</Action><Action variant={variant} disabled>不可用</Action><Action variant={variant} loading onPress={noop}>处理中</Action></div>)}</Samples>
    <Samples title="图标操作 · 默认、透明、选中、禁用、加载"><div className="catalog-row"><IconAction label="描边操作" tooltip onPress={()=>report('描边')}>{icon}</IconAction><IconAction label="切换选中" variant="quiet" active={checked} tooltip onPress={()=>setChecked(!checked)}>{icon}</IconAction><IconAction label="删除（不可用）" variant="quiet" tone="danger" tooltip disabled><MailIcon name="trash"/></IconAction><IconAction label="加载中" variant="quiet" loading onPress={noop}>{icon}</IconAction></div></Samples>
    <Samples title="内容淡入 · 可切换减少动态效果后对比"><Action variant="secondary" onPress={()=>setPage(n=>n+1)}>播放内容切换</Action><ContentSwapTransition contentKey={String(page)}><p>内容 {page}：工作区域保留，新内容就绪后短淡入。</p></ContentSwapTransition></Samples>
  </>;
  if(family==='forms') return <>
    <Samples title="复选框 · 未选、选中、半选、禁用"><div className="catalog-grid"><CheckboxField label="可切换复选框" checked={checked} onCheckedChange={setChecked}/><CheckboxField label="半选复选框" checked={checked} indeterminate={mixed} onCheckedChange={next=>{setMixed(false);setChecked(next);}}/><CheckboxField label="不可用未选" checked={false} disabled/><CheckboxField label="不可用选中" checked disabled/></div></Samples>
    <Samples title="输入、选择与验证"><div className="catalog-grid"><TextField label="邮箱地址" ref={emailRef} value={text} onChange={e=>setText(e.target.value)} placeholder="name@example.com" hint="仅示例输入"/><TextField label="错误字段" defaultValue="invalid" error="请输入完整邮箱地址"/><TextField label="禁用字段" defaultValue="不可编辑" disabled/><PasswordField label="示例密码" purpose="new" showLabel="显示密码" hideLabel="隐藏密码"/><SearchBox label="搜索样例" placeholder="搜索组件" value={text} onValueChange={setText}/><SelectField label="选择器" options={options} value={value} onValueChange={setValue}/><ComboField label="可搜索选择器" options={options} value={value} onValueChange={setValue} placeholder="输入选项"/><DatePickerField label="日期" calendarLabel="选择示例日期"/><TextAreaField label="多行内容" rows={3}/><FileField label="选择示例文件" hint="不会上传" onFile={file=>report(file?.name||'未选择文件')}/></div><FormErrorSummary title="提交检查样例" errors={[{fieldId:'email',message:'请输入完整邮箱地址',label:'邮箱地址',onFocus:()=>emailRef.current?.focus()}]}/></Samples>
    <Samples title="开关与单选"><SwitchField presentation="row" label="启用选项" description="原组件的选中和键盘行为" checked={checked} onCheckedChange={setChecked}/><SwitchField presentation="row" label="不可用开关" description="禁用状态" checked disabled onCheckedChange={noop}/><RadioGroupField label="单选选项" presentation="inline" options={options} value={value} onValueChange={setValue}/></Samples>
  </>;
  if(family==='menus') return <Samples title="按内容收缩 · 单项、分组、长文本与子菜单"><div className="catalog-row">
    <MenuButton ariaLabel="单项菜单" label="单项菜单" items={[{id:'unread',label:'标记未读'}]} onAction={report}/>
    <MenuButton ariaLabel="分组菜单" label="分组菜单" groups={[{id:'nav',label:'',items:[{id:'settings',label:'个人设置',icon:<MailIcon name="settings"/>},{id:'mail',label:'返回邮箱',icon}]},{id:'session',label:'',items:[{id:'logout',label:'退出登录',icon:<MailIcon name="logout"/>}]}]} onAction={report}/>
    <MenuButton ariaLabel="边界菜单" label="长文本与禁用" items={[{id:'long',label:'这是一条很长的菜单文字，用于确认它能在视口内完整换行显示'},{id:'disabled',label:'不可用操作',disabled:true},{id:'delete',label:'危险操作',tone:'danger',icon:<MailIcon name="trash"/>}]} onAction={report}/>
    <MenuButton ariaLabel="移动菜单样例" label="移动到文件夹" groups={[{id:'move',label:'',items:[{id:'folders',label:'目标文件夹',value:'收件箱',selectedId:'inbox',options:[{id:'inbox',label:'收件箱'},{id:'archive',label:'归档'}]}]}]} onAction={report}/>
  </div></Samples>;
  if(family==='overlays') return <Samples title="定位、关闭、焦点返回与错误保留"><div className="catalog-row">
    <TooltipAction label="悬停说明" tooltip="也可以通过键盘聚焦查看"/>
    <PopoverCard triggerLabel="打开提示面板" title="补充信息"><p>按需呈现，Escape 关闭并返回入口。</p></PopoverCard>
    <DialogSurface triggerLabel="编辑示例" title="编辑示例" description="检查输入保留及取消焦点" cancelLabel="取消" confirmLabel="保存" onConfirm={()=>report('保存')}><TextField label="示例名称" value={text} onChange={e=>setText(e.target.value)}/></DialogSurface>
    <DialogSurface triggerLabel="保存失败示例" title="失败后保留内容" description="检查错误与重试" cancelLabel="取消" confirmLabel="尝试保存" failureMessage="示例保存失败，输入仍保留。" onConfirm={()=>Promise.reject(new Error('sample'))}><TextField label="失败示例输入"/></DialogSurface>
    <DrawerSurface triggerLabel="打开抽屉" title="编辑抽屉" description="检查边缘进入和滚动" closeLabel="关闭抽屉"><TextField label="抽屉输入" value={text} onChange={e=>setText(e.target.value)}/></DrawerSurface>
    <ConfirmDialog triggerLabel="停用确认示例" title="停用示例账号？" description="交互样例，不改变真实账号。" impact="停用后该账号将无法继续使用邮箱。" cancelLabel="保持启用" confirmLabel="确认停用" failureMessage="操作失败" tone="danger" onConfirm={()=>report('停用示例')}/>
    <CommandMenu triggerLabel="打开命令菜单" title="命令样例" searchLabel="查找命令" searchPlaceholder="搜索命令" emptyLabel="无匹配命令" items={[{id:'inbox',label:'打开收件箱',description:'示例导航动作'},{id:'compose',label:'写邮件',description:'示例编辑动作'}]} onAction={report}/>
  </div></Samples>;
  if(family==='feedback') return <Samples title="状态、提示与通知"><div className="catalog-row">{(['neutral','success','warning','danger','info'] as const).map(tone=><span className="catalog-row" key={tone}><Badge tone={tone}>{tone}</Badge><StatusPill tone={tone}>{tone}</StatusPill></span>)}</div><Action variant="secondary" onPress={()=>setVisible(!visible)}>切换通知显示</Action><FeedbackPresence visible={visible}><NotificationCard title="示例通知" description="检查多操作和关闭入口" icon={icon} primaryActionLabel="查看" secondaryActionLabel="稍后" dismissLabel="关闭通知" onPrimaryAction={()=>report('查看')} onSecondaryAction={()=>setVisible(false)} onDismiss={()=>setVisible(false)}/></FeedbackPresence><AlertBanner title="请求失败" description="错误保持显示，直到处理或关闭。" tone="danger" icon={icon} actionLabel="重试" onAction={()=>report('重试')}/><div className="catalog-row"><Action onPress={()=>feedback.notify({title:'已保存示例',tone:'success'})}>成功反馈</Action><Action variant="secondary" onPress={()=>feedback.notify({title:'请求失败示例',tone:'danger',duration:'persistent'})}>持续错误反馈</Action></div></Samples>;
  if(family==='surfaces') return <Samples title="表面与身份"><div className="catalog-grid"><Card appearance="outlined"><CardHeader title="描边卡片" description="嵌套内容没有额外阴影"/><CardContent><UserIdentity name="示例用户" description="operator@example.com" presence={{label:'在线',tone:'success'}}/></CardContent><CardFooter><Action variant="secondary" onPress={()=>report('卡片操作')}>操作</Action></CardFooter></Card><Panel appearance="embedded" className="p-4"><Avatar name="示例用户" size="lg"/><DescriptionList label="示例信息" items={[{id:'role',term:'角色',description:'运营账号'},{id:'empty',term:'未设置',description:null}]}/></Panel></div><DisclosurePanel title="展开补充说明">折叠内容使用原组件的键盘和展开语义。</DisclosurePanel><ReadyImage src="/favicon.ico" alt="示例图像" width={48} height={48} error={<p>图像不可用时显示稳定占位</p>}/></Samples>;
  if(family==='navigation') return <Samples title="导航、切换与分页"><BreadcrumbTrail label="示例路径" items={[{id:'root',label:'组件规范',href:'/ui-elements/'},{id:'here',label:'导航'}]}/><TabsView label="选项卡样例" variant="line" selectedId={tab} onSelectionChange={setTab} items={[{id:'one',label:'第一项',icon,content:<p>第一项内容</p>},{id:'two',label:'第二项',badge:3,content:<p>第二项内容</p>},{id:'disabled',label:'不可用',disabled:true,content:null}]}/><ToggleGroup label="独立多选" selectionMode="multiple" selectedIds={selected} onSelectionChange={setSelected} options={[{id:'one',label:'选项一',icon},{id:'two',label:'选项二',icon},{id:'three',label:'不可用',disabled:true}]}/><StepNavigation label="进度导航" items={[{id:'one',label:'已完成',state:'complete'},{id:'two',label:'当前步骤',state:'current'},{id:'three',label:'待处理',state:'upcoming'}]}/><PaginationControl label="样例分页" page={page} totalPages={10} onPageChange={setPage} previousLabel="上一页" nextLabel="下一页" getPageLabel={n=>`第 ${n} 页`}/><div className="catalog-row"><NavigationHint label="返回组件规范"><a href="/ui-elements/">带说明的导航链接</a></NavigationHint><TextLink href="/">返回邮箱</TextLink><NavigationFlyout label="展开子导航" icon={icon} isOpen={open} onOpenChange={setOpen}><TextLink href="/ui-elements/forms/">表单规范</TextLink></NavigationFlyout></div></Samples>;
  return <><Samples title="表格与树"><DataTable label="紧凑表格样例" density="compact" columns={[{id:'email',label:'邮箱',rowHeader:true,render:row=>row.email},{id:'status',label:'状态',render:()=> <StatusPill tone="success">启用</StatusPill>}]} rows={[{id:'one',email:'first@example.com'},{id:'two',email:'second@example.com'}]} emptyContent="无数据" selection={{mode:'multiple',selectedIds:selected,onSelectionChange:setSelected}}/><Tree label="层级集合" selectionMode="single" nodes={[{id:'root',label:'项目',children:[{id:'child',label:'子项目'},{id:'disabled',label:'不可用项目',disabled:true}]}]} expandLabel={s=>`展开 ${s}`} collapseLabel={s=>`收起 ${s}`}/></Samples><Samples title="加载、空态、失败与内容切换"><SelectField label="异步阶段" value={phase} onValueChange={v=>setPhase(v as AsyncRegionPhase)} options={['initial','ready','refreshing','background','empty','error'].map(value=>({value,label:value}))}/><AsyncRegion label="异步样例" phase={phase} loading={<Skeleton className="h-20 w-full"/>} refreshing={<BusyIndicator label="更新中" size="sm" showLabel/>} empty={<StateSurface compact state="empty" title="无数据" description="筛选后没有结果" icon={icon}/>} error={<StateSurface compact state="error" title="请求失败" description="可保留操作上下文并重试" icon={icon} actionLabel="重试" onAction={()=>setPhase('ready')}/>}><ContentSwapTransition contentKey={String(page)}><p>内容已就绪，第 {page} 页。</p><ProgressMeter value={45} label="示例进度，非真实业务数据"/></ContentSwapTransition></AsyncRegion><LiveRegion visuallyHidden={false}>当前阶段：{phase}</LiveRegion></Samples></>;
}

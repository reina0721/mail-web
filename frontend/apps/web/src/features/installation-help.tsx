import {normalizeStalwart} from '../host/stalwart-origin';
export {normalizeStalwart};
export type Discovery = {
 stalwartUrl:string; documentationUrl:string; domains:{id:string;name:string}[];
 accounts:{id:string;name:string;email:string}[]; hooks:{id:string;url:string;matchesDeployment:boolean}[];
 links:Record<string,string>;sections:Record<string,string>;callbackUrl:string|null;
};
export const defaultDocs='https://github.com/reina0721/mail-web/blob/main/docs/stalwart-setup.md';
const guidance:Record<string,{text:string;menu:string;link?:string}>={
 access:{text:'本 Webmail 的安装管理能力；已登录的运营身份无需重复填写。',menu:'安装目录 → deploy/mail-web.sh setup'},
 connection:{text:'填写部署的 Stalwart HTTPS 地址，不是本 Webmail 地址，也不是 @ 后的邮箱域名。',menu:'Stalwart 管理入口',link:'admin'},
 site:{text:'名称显示在页面；网站访问地址必须是用户实际访问本 Webmail 的地址。',menu:'当前 Webmail 的域名或 IP:端口'},
 directory:{text:'专用目录服务身份的 API 密钥，用于读取域名、管理平台账号；不是管理员密码或个人邮箱密码。',menu:'Management → Directory → Accounts；服务身份登录后 Account → Credentials → API Keys',link:'keys'},
 domain:{text:'先在 Stalwart 创建邮件域名，再在此选择。域名 ID 自动读取，不从服务主机名猜测。',menu:'Management → Domains',link:'domains'},
 operator:{text:'用已有普通邮箱及其密码证明所有权，绑定为本 Webmail 运营身份。恢复邮箱必须在该邮件域名之外。',menu:'Management → Directory → Accounts',link:'accounts'},
 'notification-key':{text:'验证码发件邮箱自己的 API Secret，不是目录服务密钥；以该发件身份登录后创建。',menu:'Account → Credentials → API Keys（验证码发件身份）',link:'keys'},
 notification:{text:'专门发送验证码的普通邮箱。选择账号后读取 ID 和发件地址；其 API 密钥需以该发件身份创建。',menu:'Management → Directory → Accounts；发件身份登录后 Account → Credentials → API Keys',link:'accounts'},
 turnstile:{text:'保护公开注册和找回密码。Site Key 与 Secret 成对来自 Cloudflare，并配置实际 Webmail 主机名。',menu:'Cloudflare Dashboard → Turnstile → Add widget'},
 hook:{text:'用于跨 SMTP／JMAP 的发信限额。只选回调指向本部署的专用 Hook；共享密钥由创建时设置。',menu:'Settings → MTA → Filters → MTA Hooks',link:'hooks'},
 acceptance:{text:'连接成功不代表提交协议已验收。完成真实限额、停机失败关闭及重启检查后，由 CLI 记录验收声明。',menu:'本安装 deploy/mail-web.sh policy-verified true'},
};
export function SetupHelp({topic,base,docs=defaultDocs,links}:{topic:keyof typeof guidance;base:string;docs?:string;links?:Record<string,string>}){
 const item=guidance[topic], fallback=item.link==='keys'?'/account/':'/admin/';
 const target=base&&item.link?(links?.[item.link]??base+fallback):'';
 return <aside className="setup-help"><p>{item.text}</p><small>位置：{item.menu}</small><div><a href={docs+'#'+topic} target="_blank" rel="noopener noreferrer" aria-label={'查看'+item.menu+'配置教程'}>查看配置教程 ↗</a>{target&&<a href={target} target="_blank" rel="noopener noreferrer">{/\/(admin|account)\/$/.test(target)?'打开 Stalwart 管理入口 ↗':'打开 Stalwart 对应页面 ↗'}</a>}{topic==='turnstile'&&<a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener noreferrer">打开 Cloudflare Turnstile ↗</a>}</div></aside>;
}

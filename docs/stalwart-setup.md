# Stalwart 自动配置与高级排错教程

<a id="automatic"></a>
## 推荐：一次授权自动配置

正常安装不需要手工创建服务账号、抄写 ID、配置 Hook 或复制 Turnstile Site Key／Secret。进入 `/setup/`，以安装令牌或本安装运营身份管理配置。

1. **连接授权：** 输入 Stalwart 服务来源，例如 `https://mail.example.com:8443`；默认填写管理员账号和密码，也可以选择管理员 API 密钥。双重验证开启后，普通密码不能用于 HTTP Basic，请选择 API 密钥。凭据只在服务器内存中临时使用，不写入配置、日志、数据库或浏览器存储。
2. **可选 Turnstile：** 在 Cloudflare **My Profile → API Tokens → Create Token → Create Custom Token** 创建仅针对目标账号、具有 **Account → Turnstile → Edit**（API 名称 `Turnstile Sites Write`）的 Token，粘贴到向导。不需要 Global API Key、DNS 写入权限或手工创建 Widget。验证后只有一个可访问账号会自动选中；多个账号需选择；没有列账号权限时可直接补填 Account ID。
3. **验证并读取：** 点击“验证授权并读取域名”。程序读取管理员有效权限和域名；不足时显示缺失权限。管理员需要域名读取、账号读取／创建／更新、Hook 读取／创建、Action 创建及 ReloadSettings 权限；新建域名还需域名创建权限。管理员输入框成功后清空，临时授权闲置十分钟失效。
4. **选择与绑定：** 明确选择邮箱域名，或勾选“在 Stalwart 新建邮箱域名”。填写真实 Webmail 网站访问来源和站点名称。默认绑定已有普通邮箱，填写原密码与外部恢复邮箱；也可以选择新建普通运营邮箱并设置至少十二位密码。管理员和服务身份不能充当普通运营邮箱；已有账号的服务器或域名迁移不能通过初始化覆盖。
5. **检查与执行：** 点击“检查并预览配置”，核对资源清单，再点击一次“自动配置”。程序为本安装创建独立服务身份和受限 API 密钥、验证码发件账号及密钥、共享密钥和禁用的 MTA Hook；启用 Turnstile 自动配置时创建 `managed` Widget，并自动保存返回的 Site Key／Secret。所有内部 ID 自动填写。
6. **应用与检查：** 运行凭据先加密记录到 `config/initialization.enc`；完整运行配置写入 `config/runtime.enc`。应用并重启后先检查新回调认证，再同步本安装账号作用范围并启用专用 Hook。回调检查不代表已经完成真实 SMTP／JMAP 限额、验证码送达或公网注册验收。

Webmail 网站来源、Stalwart 来源和邮箱域名是三项独立信息。Cloudflare Token 只发送到官方 API，Stalwart 管理员凭据只发送到本次授权的服务来源；更换来源后必须重新授权。运行期间不使用管理员密码或 Cloudflare Token，而使用自动生成并加密保存的专用凭据。

**刷新、取消与失败重试：** 页面刷新后恢复任务；服务中断或授权过期后重新提供凭据，继续原来的计划。程序保留已完成资源及其归属信息，不覆盖同名未知资源、不重置已有密码，也不会轮换其他 Widget 的 Secret。取消停止后续步骤，不自动删除远端资源；配置应用中的短暂原子阶段不能中断。创建结果无法确认时停止并解释，避免重复创建。新回调认证或启用失败时不启用该 Hook；存在旧配置时恢复旧配置后重试。

自动初始化不改 DNS、反向代理或证书，也不自动开放公开注册。新建邮件域名后，邮件 DNS 与外部投递仍需按 Stalwart 部署要求完成。无 Cloudflare Token 时保留已有 Turnstile 配置，未配置则保持相关公开功能不可用。

以下章节是**高级手工配置与排错**，用于已有凭据导入、定位权限和修复问题；不是默认安装步骤。

本教程适用于 Stalwart 1.0.1 管理对象接口。界面为英文；其他版本请以实际 WebUI 的菜单和 schema 为准。配置面板会读取该服务器的 schema 生成对应入口；无法确认时进入管理首页，并保留下面的菜单路径供手动查找。

## 先选一条配置路线

**仅使用已有邮箱：** 获取安装管理令牌或登录运营身份 → 填写 Stalwart 服务地址 → 创建并填写目录服务密钥 → 验证并读取 → 选择已有邮箱域名 → 填写站点名称和 Webmail 网站地址 → 保存并等待重启 → 首次安装绑定已有普通邮箱。验证邮件、Turnstile、Hook 不影响已有邮箱的登录和阅读；没有配置并验收提交策略时，不宣称跨协议限额已生效，公开注册保持关闭。

**开放注册和密码找回：** 先完成上述连接 → 准备验证码发件邮箱及其密钥 → 配置 Turnstile → 准备仅属于本部署的 MTA Hook → 保存 → 实测发信限额与失败关闭 → 用 CLI 记录验收声明 → 运营后台开放注册。连接成功不等于这条路线已经完成。

## 三个地址不能混用

| 示例 | 是什么 | 填到哪里 |
|---|---|---|
| `https://mail.example.com:8443` | 已部署的 Stalwart HTTPS 服务 | Stalwart 服务地址 |
| `example.com` | 邮箱地址 `person@example.com` 的域名 | 邮箱域名选择器 |
| `https://webmail.example.com` | 用户访问本项目的地址 | Webmail 网站访问地址 |

示例不代表项目默认域名。输入裸主机名会补 `https://`，保留端口；可粘贴 `/admin/`、`/account/` 入口并归一化为来源。其他子路径、登录信息、查询参数不能作为服务地址。SSH 本地管理代理地址不等于正式 Webmail 地址。

<a id="access"></a>
## 安装管理令牌

- **用途与必填条件：** 首次安装、运营登录不可用时管理当前 Webmail。已登录的运营身份可直接读取配置。
- **在哪里：** Webmail 的安装目录，不在 Stalwart 管理后台。
- **获取步骤：** SSH 登录部署服务器，运行 `sh "$INSTALL_DIR/deploy/mail-web.sh" setup`。复制输出链接中 `setup_token=` 后的内容，或使用完整安装链接打开面板。`INSTALL_DIR` 必须换成自己安装时选择的目录。
- **复制哪个值：** `secrets/setup.key` 中的安装令牌；不是 `session.key`、邮箱密码或 Stalwart API 密钥。
- **权限与验证：** 它能管理本安装。输入后应回读配置；已有配置读取失败时不能直接提交空白表单。
- **常见错误：** 复制了另一套安装的令牌、带入多余空格。可使用 CLI `rotate-setup-token` 轮换，旧令牌随后失效。

<a id="connection"></a>
## Stalwart 服务地址

- **用途与必填条件：** 必填，供 Webmail 通过 HTTPS JMAP 连接已有邮件服务。
- **在哪里：** 部署 Stalwart 时设置的 HTTPS 管理入口；先用浏览器确认能进入 `/admin/` 或 `/account/`。
- **填写步骤：** 例如填 `mail.example.com:8443`，离开输入框后归一化为 `https://mail.example.com:8443`。不用追加 `/jmap/`。
- **自动生成：** 地址有效即出现对应管理入口和本 GitHub 教程。提供目录密钥后，点击“验证并重新读取”，或填写密钥后离开输入框自动读取。
- **验证方法：** 域名列表出现且显示连接成功。此操作只读，不保存、不重启，也不会创建远程对象。
- **常见错误：** 填成邮箱域名、Webmail 地址、HTTP 来源、无效证书或未开放的端口。服务器必须能访问该 HTTPS 来源。更换来源必须重新提供新服务器的密钥，旧密钥不会自动发送过去。

<a id="site"></a>
## 站点名称与 Webmail 网站访问地址

| 字段 | 用途与位置 | 填写示例 | 验证与常见错误 |
|---|---|---|---|
| 站点名称 | 本 Webmail 显示的品牌；在本面板填写 | `团队邮箱` | 保存后标题和导航品牌更新；不能留空 |
| Webmail 网站访问地址 | 用户实际访问本 Webmail 的来源；来自你的 DNS/HTTPS 反代或安装时明确选择的 IP:端口 | `https://webmail.example.com` | 协议、主机、端口必须准确，不含路径；不能填 Stalwart 地址或临时 SSH 本地代理地址 |

两项必填。公网 HTTP 需安装时显式选择 `--allow-http`，它不会获得 HTTPS 加密。通过 SSH 辅助入口管理时，保留服务器已经保存的网站地址。再次打开面板会自动回读；读取失败应先重试，不能照着空白表单覆盖旧配置。

<a id="directory"></a>
## 专用目录服务身份与 API 密钥

**用途：** 读取域名及账号，供平台开户、停用、配额和策略同步使用。它不是日常运营邮箱，也不是 Stalwart 管理员密码。连接路线必填。

### 1. 在 Stalwart 管理后台创建服务身份

1. 以 Stalwart 管理员进入 **Management → Directory → Accounts**。
2. 创建普通 `User`，例如名称 `mail-web-directory`，选择本部署所用的邮件域名。设置该服务身份自己的强密码；不要给它 `Admin` 角色。
3. 编辑该身份的 `Permissions`，按用途启用以下权限；不要仅凭账号名称判断它具备了权限。

| 用途 | 所需权限 |
|---|---|
| 域名读取 | `sysDomainGet`、`sysDomainQuery` |
| 邮箱账号管理 | `sysAccountGet`、`sysAccountQuery`、`sysAccountCreate`、`sysAccountUpdate` |
| 使用专用提交 Hook 时 | `sysMtaHookGet`、`sysMtaHookUpdate`、`sysActionCreate`、`actionReloadSettings` |

保留该服务身份正常认证和管理自身 API 密钥所需的权限。创建 Hook 本身由管理员完成，无需为了探测而授予目录服务创建 Hook 的权限。

### 2. 以服务身份创建密钥

1. 使用单独的浏览器会话，以刚创建的服务身份登录 Stalwart `/account/`；不要仍以管理员身份创建一枚管理员密钥代替它。
2. 进入 **Account → Credentials → API Keys**，新建 API Key，填写可辨识名称，例如 `Webmail directory`。
3. 目录密钥选择继承这个**专用非管理员身份**。Stalwart 要求管理者同时持有被管理账号的权限，因此不能简单将目录密钥收窄为只有 `sysAccount*`：它仍需保留所管理普通邮箱的 User 权限。系统管理权限仅开启上表所需项目，不使用管理员身份的密钥替代。API Key 的 `Replace` 权限列表字段是 `permissions`，与账号权限对象的 `enabledPermissions` 不同；默认自动向导会处理这些区别。
4. 创建完成时，复制返回的 **Secret**，粘贴到本项目“专用目录服务 API 密钥”。**不是 Key ID、账号 ID，也不是服务身份登录密码。**
5. 离开密钥输入框，等待只读探测；也可点击“验证并重新读取”。

**验证：** 能读取域名；选择域名后账号查询成功；配置 Hook 时对应分项也成功。只读成功只证明读取能力，不会通过写入测试来证明创建/修改权限。

**常见错误：** 当前登录的是管理员、复制了 ID 而非 Secret、密钥已过期或撤销、账号有权限但密钥又收窄了权限。Secret 只在创建时返回一次，不能根据域名找回；丢失后需创建替代密钥，并在确认替换成功后撤销旧密钥。已保存的密钥留空表示保留，不会回显。

参考：[官方 API 密钥说明](https://stalw.art/docs/auth/authentication/api-key/)、[ApiKey 对象](https://stalw.art/docs/ref/object/api-key/)。

<a id="domain"></a>
## 邮箱域名与自动读取的域名 ID

- **用途与必填条件：** 必填，决定本部署管理哪个邮件域名；与服务主机名可以不同。
- **在哪里创建：** Stalwart **Management → Domains**。例如创建 `example.com`，并按 Stalwart 文档完成邮件所需 DNS、证书和投递配置；连接面板不会替你创建域名或改 DNS。
- **填写步骤：** 连接探测成功后，在“邮箱域名”选择器中明确选择。存在多个域名时不会擅自替你选择。
- **复制哪个值：** 不需要手抄 ID。面板根据所选域名读取 ID，并显示“域名 ID 已自动读取”。
- **最低权限：** 目录服务具有 `sysDomainGet`；教程同时列出后续管理查询使用的 `sysDomainQuery`。
- **验证与常见错误：** 域名必须出现在 Stalwart 返回的列表中。列表没有目标域名时，先在 Stalwart 检查创建结果及密钥权限；不要把 `mail.example.com` 当作必然等于 `example.com`。已有平台账号后不支持直接更换邮箱域名。

参考：[Domain 对象](https://stalw.art/docs/ref/object/domain/)。

<a id="operator"></a>
## 运营邮箱、邮箱密码与外部恢复邮箱

| 字段 | 从哪里取得 | 填什么、如何验证 |
|---|---|---|
| 运营邮箱地址 | Stalwart **Management → Directory → Accounts** 中已有的普通用户邮箱 | 例如 `operator@example.com`；必须属于所选域名 |
| 邮箱密码 | 该普通邮箱自己的登录密码 | 服务器实际验证所有权，不是安装令牌、目录 API 密钥或管理员密码 |
| 外部恢复邮箱 | 运营人自己能接收验证邮件的外部邮箱 | 不能属于当前所管理的邮件域名，不填写示例中的占位地址 |

首次接通后必填，用来建立本安装的运营身份。绑定不重置该邮箱密码，也不赋予它 Stalwart 管理员角色；已有绑定时不重复初始化。目录服务身份、Stalwart 管理员不能混作普通运营邮箱。完成后用同一个邮箱和密码登录本 Webmail，账号菜单应出现运营入口。

<a id="notification"></a>
## 验证邮件发件账号、账号 ID 与发件地址

**条件：** 开放注册或使用找回密码时需要；仅连接已有邮箱可暂不填。

1. 在 Stalwart **Management → Directory → Accounts** 创建专门的普通发件邮箱，例如 `verification@example.com`，确保该邮箱可正常发信。
2. 回到本面板，选择邮箱域名并重新读取，在“验证邮件发件账号”中选择该邮箱。面板自动填入账号 ID 和主发件地址，不从名称猜测 ID。
3. 发件地址应属于这个账号且在所选邮件域名内。若人工改用别名，先在 Stalwart 配置并确认该身份允许用这个地址发信。
4. 创建并填写下一节的发件 API 密钥。目录服务密钥不能替代发件身份的密钥。

**最低读取权限：** 目录服务具备 `sysAccountGet`。账号列表只返回所选域名的普通候选；为空或权限不足时检查该域名是否选择正确、读取权限是否可用。

**验证：** 保存后，在完成 Turnstile 配置的实际来源测试验证码邮件接收；单纯出现账号 ID 不代表邮件已经送达。

<a id="notification-key"></a>
## 验证邮件 API 密钥

- **在哪里：** 以刚选中的验证码发件邮箱登录 Stalwart `/account/`，进入 **Account → Credentials → API Keys**。
- **创建与复制：** 创建该发件身份的 API Key，复制创建时返回的 **Secret**，不是账号 ID 或 Key ID。
- **用途与权限：** 代表该邮箱通过 JMAP 创建并提交验证邮件；使用普通发件身份所需的邮箱、发信及自身凭据权限，不授予域名和其他账号的系统管理权限。
- **验证：** 发送实际验证码并确认收到。若出现权限、发件身份或提交错误，检查密钥是否属于上面选定的账号、邮箱是否允许发信以及配额是否足够。
- **保留与丢失：** 留空保留已保存值；不回显。Secret 丢失时创建替代密钥，确认替换成功后撤销旧密钥。

<a id="turnstile"></a>
## Turnstile Site Key 与 Secret

**所在系统：Cloudflare，不在 Stalwart。** 用于保护公开注册及找回密码的验证码申请。

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Turnstile → Add widget**。
2. 为实际 Webmail 主机名创建站点，例如 `webmail.example.com`；不要填写 Stalwart 主机名或临时 SSH 本地入口。
3. 将 **Site Key** 填入同名字段；将同一 Widget 的 **Secret Key** 填入 `Turnstile Secret`。两项不能颠倒或来自不同 Widget。
4. 保存后在最终网站来源完成真实人机验证，并申请一封验证码邮件。不要把隔离测试密钥当作生产验收。

Site Key 用于浏览器；Secret 用于服务端校验，仅加密保存。常见错误包括主机名不匹配、Secret 复制错误、Token 过期、将后端校验失败误认为“前端打勾就算成功”。更换网站来源后重新核对 Cloudflare 的主机名设置。

参考：[Cloudflare Turnstile 入门](https://developers.cloudflare.com/turnstile/get-started/)。

<a id="hook"></a>
## MTA Hook、回调地址与共享密钥

**用途：** 让 SMTP、原生 JMAP 与 Webmail 的外部收件人数限额在同一策略下执行。公开注册开放前需要完成配置与协议验收。

1. 以 Stalwart 管理员进入 **Settings → MTA → Filters → MTA Hooks**，创建一个只属于此 Webmail 的 Hook；不要编辑或复用其他应用的 Hook。
2. 回调 URL 填入本 Webmail 的 `/internal/mta-hook`。例如正式来源是 `https://webmail.example.com`，则为 `https://webmail.example.com/internal/mta-hook`。从 Stalwart 所在容器验证该回调可达；`localhost` 指 Stalwart 自己的容器，不能用来指代另一个容器。
3. 为 Hook 的 HTTP 认证选择 Bearer，设置独立的强随机共享密钥。把同一个值填入本面板“MTA Hook 共享密钥”；它不是目录 API 密钥、Hook ID 或安装令牌。
4. 阶段配置为 `data`；失败应临时拒绝提交（`tempFailOnError=true`），超时按本项目辅助脚本使用 5000ms，响应上限 4096 字节。新 Hook 初始禁用，确认作用范围与回调后再按高级初始化及协议验收流程启用。
5. 目录服务需要 `sysMtaHookGet`、`sysMtaHookUpdate`、`sysActionCreate`、`actionReloadSettings`，用于读取和同步本部署作用范围；不要为了探测而授予创建或删除其他 Hook 的权限。
6. 在 Webmail 面板重新读取，选择显示“本部署回调”的 Hook。ID 从候选读取，不需要手抄。回调不匹配的候选显示地址并禁止新选择；已保存的旧值会保留供核对，不自动替换。
7. 保存连接后，如果走的是“绑定已有普通邮箱”路线，到 **本 Webmail 运营后台 → 邮箱账号 → 对应邮箱**，核对容量和发信限额并保存一次，以安排该账号的策略同步。到 **任务与审计** 确认任务已完成。同步会将本安装账号的作用范围写入专用 Hook 并重载设置；任何一步失败都应先排查任务，不能直接记录验收通过。新建运营邮箱的高级初始化命令会执行相应的作用范围同步，不需要重复初始化已有账号。

**验证：** 回调匹配只证明 URL 对应；共享密钥、网络可达性、作用范围及协议限额仍须实际测试。如果部署使用不同的内部回调来源，应先按教程将 Hook 配置为面板显示的来源或完成相应网络安排，再选择；本版本不把任意其他回调当作匹配。

安装器可能已生成本地 `secrets/mta-hook.key`，因此面板会显示共享密钥“已设置”，即使尚未创建远程 Hook。这只代表本地保存了值，不证明两端一致。创建新 Hook 时可以在两端明确填写同一个新随机值，或按自己的密钥管理流程使用该本地文件中的值；不要把“已设置”当作验证成功。探测不会从 Stalwart 找回共享密钥。

**常见错误：** 用容器内 `localhost`、填成 Stalwart 的 `/jmap/`、Bearer 密钥两侧不一致、Hook 仍禁用、误改其他应用的 Hook、缺少 ReloadSettings 权限。敏感认证字段不参与探测返回。

参考：[官方 MTA Hooks](https://stalw.art/docs/mta/filter/mtahooks/)、[MtaHook 对象](https://stalw.art/docs/ref/object/mta-hook/)。

<a id="acceptance"></a>
## 提交协议验收声明与注册开放条件

“连接成功”表示只读 API 可用；“已记录验收声明”是部署人完成协议测试后的记录。两者分开显示，面板不能自动把前者升级为后者。

1. 在明确隔离的测试环境中按仓库集成测试验证 Webmail、原生 JMAP 和 SMTP 共享外部收件人数计数、并发与重复提交不重复计数、超过限额拒绝提交。
2. 验证策略服务不可用时提交失败关闭、正常外部来信仍可接收，并确认重启后的计数与配置保留。
3. 核对本部署专用 Hook 的作用范围，确认不影响其他服务；公开来源还需要完成实际 Turnstile 与验证码收信流程。
4. 完成上述检查后，运行 `sh "$INSTALL_DIR/deploy/mail-web.sh" policy-verified true` 记录声明。该命令不会替你执行协议测试。需要撤销时运行 `policy-verified false`。
5. 回到面板查看缺失项，条件齐备后到 **本 Webmail 运营后台 → 注册策略** 开放注册。条件未满足时保持关闭。

面板列出的缺失项以已保存配置为准；输入尚未保存时不会假称配置已生效。修改连接或 Hook 关键参数后，原验收声明会失效，需要重新核对。

若先连接后补填正式 Webmail 地址，在读取可选账号和 Hook 前点击“验证并重新读取”，让候选信息与当前地址一致。已有平台账号时，迁移到另一套 Stalwart 还涉及远端账号 ID、草稿及数据对应关系，不能把“提供新密钥”当作完成了服务器迁移。

## 三种身份的区别

| 身份 | 用在哪里 | 不应拿来替代什么 |
|---|---|---|
| Stalwart 管理员 | 创建域名、服务身份、专用 Hook | 不填入本 Webmail 的目录 API 密钥或运营邮箱密码 |
| 专用目录服务身份 | 后端管理目录与同步本部署策略 | 不用于日常阅读邮件或验证码发件 |
| 普通运营邮箱 | 登录本 Webmail，获得本安装的运营入口 | 不需要 Stalwart Admin 角色 |
| 验证码发件邮箱 | 发送验证码邮件 | 它的 API 密钥不能替代目录服务密钥 |

## 保存失败与排查

| 提示 | 下一步 |
|---|---|
| 安装令牌无效／登录过期 | 获取当前安装令牌，或重新登录运营身份，再读取配置 |
| 无法连接 Stalwart | 检查 HTTPS 来源、证书、端口，以及 Webmail 容器的网络可达性 |
| 某个分项权限不足 | 对照对应教程检查身份权限及 API Key 的进一步限制；其他成功分项保留 |
| 域名不存在 | 在 Stalwart 创建所需域名后重新读取，不从服务主机名推断 |
| 更换服务器需重新提供密钥 | 为新来源提供明确的目录密钥，重新选择域名与可选账号/Hook |
| 等待重启超时 | 检查本安装的容器状态和 `logs/`，不要反复提交不同配置 |
| 已有账号不能改域名 | 保留原域名；域名迁移需要专门流程，不能靠覆盖配置完成 |

脚本高级初始化、安装目录选择、升级、备份及恢复见 [README 部署教程](../README.md)。自动读取不会修改 Stalwart、创建远程身份或自动恢复任何 Secret。

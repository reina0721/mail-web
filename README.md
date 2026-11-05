# Mail Web

通用、可自行部署的 Webmail 与运营面板。Next.js 静态界面由 Rust/Axum 提供，SQLite 保存平台数据，现有 Stalwart 保存邮件。**项目不预设邮件域名或运营品牌**：部署后在安装面板填写自己的站点名称、域名和 Stalwart 连接信息。公开注册默认关闭。

当前发布通道为开发预览。构建、隔离集成测试和真实部署验收分别记录，不将构建成功当作邮件投递或注册服务验收。

## 1. 部署方式与准备

- 发布平台：Linux AMD64；单实例 SQLite。
- 服务器已有 Docker Engine、Compose v2，以及 `curl jq openssl tar sha256sum flock realpath`。安装器只检查这些工具，**不安装系统软件**。
- 现有 Stalwart 提供可访问的 HTTPS JMAP 来源和已配置的邮件域名。
- 准备 Stalwart 管理员账号密码或管理员 API 密钥，用于一次性自动配置；如需自动创建 Turnstile，再准备目标 Cloudflare 账号的 Turnstile 写入 Token。
- 先选择专用安装目录、容器名称和监听地址。目录通过 `--dir` 传入，项目没有固定安装路径。

服务器下载 GitHub Release 的项目产物，校验 SHA-256，使用 `docker load` 导入镜像，再以 `--pull never --no-build` 启动。**目标服务器不从镜像仓库拉取镜像，也不编译源码。** CI 构建环境可使用官方构建和隔离测试镜像。

## 2. 下载与安装

以下目录只是示例，请自行指定：

```sh
INSTALL_DIR="$HOME/apps/mail-web"
VERSION=v0.2.0-alpha.6
mkdir -p "$INSTALL_DIR"
curl -fSL "https://raw.githubusercontent.com/reina0721/mail-web/$VERSION/deploy/install.sh" -o "$INSTALL_DIR/install.sh"
sh "$INSTALL_DIR/install.sh" \
  --dir "$INSTALL_DIR" \
  --version "$VERSION" \
  --name mail-web \
  --bind 127.0.0.1:18090
```

默认只绑定回环地址。若已准备 HTTPS 反代，将它指向所选监听端口。代理需保留正确 Host/Origin，允许 SSE 长连接并关闭缓冲。本项目不自动修改 DNS、反向代理或其他项目。

要直接通过指定 IP 和端口使用 HTTP，需要自行选择监听 IP，并显式传入 `--allow-http`。HTTP 不加密登录信息、邮件或 Cookie；管理配置应使用后文的 SSH 通道，正式用户入口建议配置 HTTPS。不能把 HTTP 登录描述为加密访问。

安装结束会显示当前安装的 `/setup/` 链接及管理令牌。该链接属于管理能力，请保密。令牌保存在本安装的 `secrets/setup.key`，不会进入镜像或 Git。再次获取或轮换：

```sh
sh "$INSTALL_DIR/deploy/mail-web.sh" setup
sh "$INSTALL_DIR/deploy/mail-web.sh" rotate-setup-token
```

无稳定版时，`latest` 会明确失败；开发预览请像示例一样指定准确版本。稳定版发布后可使用 `--version latest`。可用 `--repository OWNER/REPO` 或 `MAIL_WEB_REPOSITORY` 为自己的 fork 指定产物来源。

## 3. 进入面板配置 Stalwart

先阅读 [Stalwart 逐项配置教程](docs/stalwart-setup.md)：每个字段都列出用途、必填条件、完整菜单路径、创建步骤、复制哪个值、最低权限和排错方法。可选择“仅使用已有邮箱”或“开放注册与找回密码”两条路线。面板中的“查看配置教程”直接链接到对应章节。

访问安装器给出的地址，或 `/setup/`，输入管理令牌。已登录的运营身份也可从账号菜单进入“站点配置”。

推荐使用默认的**自动配置**：输入 Stalwart 管理员账号密码或 API 密钥 → 点击“验证授权并读取域名” → 选择已有域名或新建域名 → 绑定已有普通运营邮箱或设置新运营邮箱 → 检查预览 → 点击一次“自动配置”。专用服务身份、发件账号、API 密钥、Hook 及所有内部 ID 均由程序创建和填写。

填写 Cloudflare API Token 后，会读取可访问账号并自动创建本网站的 Turnstile Widget；无法列出账号时可补填 Account ID。管理员凭据及 Cloudflare Token 不落盘，闲置十分钟、完成或取消后清除；运行所需的专用凭据单独加密保存。详细权限、两种运营邮箱流程与失败恢复见 [自动配置教程](docs/stalwart-setup.md#automatic)。

以下是保留的“高级手工配置”字段，正常自动配置不需要逐项填写：

| 项目 | 填写内容 |
|---|---|
| 站点名称 | 你自己的品牌或组织名称 |
| 邮箱域名 | Stalwart 中已有的域名，不含 `@`；不会被安装器代替创建 |
| 网站访问地址 | 最终用户访问的完整来源，包含协议和非默认端口，不含路径 |
| Stalwart 地址 | 现有 HTTPS 来源，不含 `/jmap` 路径、用户名或密码 |
| 专用目录服务 API 密钥 | 目录管理服务身份的密钥 |

保存前，服务器会实际请求 Stalwart，确认密钥能够读取所选域名，并自动读取域名 ID。失败会保留表单输入。配置使用安装密钥加密，写入 `config/runtime.enc`；读取接口仅返回密钥是否已设置，不回显密钥。留空密钥字段会保留现有值。

保存后，进程有序退出，由 Docker 的重启策略重新启动，面板会等待新进程就绪。数据库、草稿和安装密钥保留。已有平台账号时，不允许简单替换邮箱域名。

再次进入配置面板时，已登录的运营身份会自动回读；失败时使用“读取配置／重试”，不会允许用空白表单覆盖现有配置。输入 Stalwart 地址后自动生成相关入口；填写专用密钥后可只读查询域名、账号及 Hook。通过 SSH 辅助入口访问时，网站访问地址仍应保留服务器的实际来源，不能改成临时的本地代理地址；同一服务器留空密钥字段会保留已保存的密钥。更换 Stalwart 来源必须重新提供该服务器的密钥，重新核对可选账号与 Hook。

首次接通后，在面板绑定一个**已有的普通邮箱**作为本部署的运营身份：填写该邮箱、它的密码和外部恢复邮箱。服务器先验证邮箱所有权与普通用户角色，再建立本地运营关联；不修改该账号的 Stalwart 管理员权限或密码。Stalwart 管理员及带系统权限的服务身份不能作为此处的普通运营邮箱。

运营角色仅属于本部署。默认自动向导同时支持绑定已有和新建普通运营邮箱；下文脚本是额外的高级初始化方式，不接管已有地址。

## 4. 公网 HTTP 的安全管理入口

本节工具运行在管理员自己的电脑，服务器只使用已有 SSH；不在服务器安装 Node 或代理。

管理员电脑需要 Node.js 24 和 OpenSSH。下载该版本的 `deploy/admin-access.mjs`，运行：

```sh
node admin-access.mjs \
  --ssh USER@SERVER \
  --identity /path/to/ssh-key \
  --origin http://YOUR_SERVER_IP:YOUR_PORT \
  --port 4204
```

打开工具输出的本地链接，输入安装管理令牌。它通过 SSH 加密转发，并把最终公网来源预填入“网站访问地址”。代理只监听回环，检查本地 Host 和 Origin，再转发到固定目标；不记录请求正文。结束后按 Ctrl+C 关闭。这个临时通道不会把公网 HTTP 用户入口变成 HTTPS。

已有可信 HTTPS 入口时，直接通过它打开面板即可，不需要此工具。

## 5. 目录服务、注册与提交策略

现有 Stalwart 的管理对象通过 JMAP 管理 API 访问。操作界面名称以所部署版本为准，参见 [Stalwart 管理 API](https://stalw.art/docs/management/) 和 [账号管理](https://www.stalw.art/docs/auth/accounts/manage/)。

建议创建独立的普通服务身份，只启用：

- 账号管理：`sysAccountCreate`、`sysAccountGet`、`sysAccountQuery`、`sysAccountUpdate`。
- 域名读取：`sysDomainGet`、`sysDomainQuery`。
- 使用提交策略时：`sysMtaHookGet`、`sysMtaHookUpdate`、`sysActionCreate`、`actionReloadSettings`。

为它创建专用 API 密钥。运行时不保存 Stalwart 管理员密码。不要将带系统权限的身份当作个人邮箱使用。

公开注册还需要在面板的折叠分组中配置：

1. 验证邮件身份：普通发件账号 ID、对应 API 密钥和完整发件地址。
2. Turnstile：Site Key 与 Secret；外部验证服务需要匹配实际网站来源。
3. 专用于本部署的 MTA Hook：ID 和共享密钥。不要共用其他应用的 Hook；其回调必须能够从 Stalwart 到达本部署的 `/internal/mta-hook`。
4. 实际验证 SMTP、原生 JMAP 与 Webmail 的限额、应用停机时的失败关闭行为和重启持久性。

`deploy/bootstrap-stalwart.sh` 与 `deploy/setup-hook.sh` 是可选高级辅助脚本。它们只在安装目录写入项目文件，通过 Stalwart API 创建独立服务身份和新 Hook，不改管理员密码。必须显式提供 `MAIL_DOMAIN`、`STALWART_ADMIN_EMAIL`、临时管理凭据，以及 Stalwart 可达的 `MTA_HOOK_URL`。域名和回调地址没有部署站点默认值。现有名称冲突时拒绝接管。临时管理凭据应在结束后撤销。

完成真实提交协议验收后，显式记录验收状态：

```sh
sh "$INSTALL_DIR/deploy/mail-web.sh" policy-verified true
# 撤销验收声明：
sh "$INSTALL_DIR/deploy/mail-web.sh" policy-verified false
```

这是部署人的验收声明，不代替协议测试。连接或 Hook 参数变化会使声明失效。条件齐备后，再由运营后台开放注册；不满足条件时保持关闭。

高级创建新运营邮箱：在本安装 `secrets/operator.initial-password` 写入至少 16 字符的初始密码，使用已配置的目录服务及专属 Hook 执行：

```sh
docker compose --project-directory "$INSTALL_DIR" -f "$INSTALL_DIR/compose.yaml" \
  run --rm --no-deps --pull never mail-web \
  --init-operator OPERATOR_EMAIL EXTERNAL_RECOVERY_EMAIL /app/secrets/operator.initial-password
```

命令使用本部署配置的域名，拒绝接管已有地址；结果未知时保留待核对记录，不重复创建。完成后轮换初始密码并移走明文交接文件。

## 6. CLI 更新、备份和恢复

以下命令可从任意工作目录调用；数据位置始终按已安装脚本的父目录解析。

```sh
sh "$INSTALL_DIR/deploy/mail-web.sh" version
sh "$INSTALL_DIR/deploy/mail-web.sh" status
sh "$INSTALL_DIR/deploy/mail-web.sh" check-update vNEXT_VERSION
sh "$INSTALL_DIR/deploy/mail-web.sh" backup
sh "$INSTALL_DIR/deploy/mail-web.sh" update vNEXT_VERSION
sh "$INSTALL_DIR/deploy/mail-web.sh" restart
```

更新先下载、验证和导入新镜像，再停止本安装、保存一致性快照、替换发布配置并启动。域名、站点名称、密钥、数据库和监听设置不会被发布包中的示例值覆盖。管理脚本也随已校验的发布包更新。不执行 `docker pull`、镜像清理或业务数据清理。

更新失败时保留文件和快照，并停止失败服务；按输出检查 `logs/`。数据库迁移不保证向后兼容，回滚须恢复匹配的更新前备份和旧镜像：

```sh
sh "$INSTALL_DIR/deploy/mail-web.sh" restore "$INSTALL_DIR/backups/SNAPSHOT"
```

备份使用 SQLite `VACUUM INTO` 一致性快照，包含已提交 WAL 数据；同时保存加密配置、安装密钥和 Compose 文件。恢复前校验文件，并把原数据库移到本安装的 `backups/pre-restore-*`，恢复后撤销旧会话。恢复到新的安装目录时，将快照复制到新目录的 `backups/` 中，可通过 `MAIL_WEB_CONTAINER_NAME=NEW_NAME` 选择一个未占用的容器名。不要直接恢复到正在运行的另一个项目目录。

备份包含敏感密钥，应保存独立的离线副本。丢失 `secrets/session.key` 将无法解密运行配置或会话。CLI 不自动删除历史快照、发布包和本地镜像。

## 7. 数据与边界

| 相对路径 | 内容 |
|---|---|
| `.env` | 镜像版本、容器名、监听和其他基础设施选项 |
| `config/runtime.enc` | 加密的站点与 Stalwart 配置 |
| `config/installed-release.json` | 已安装产物的版本、架构和镜像标识 |
| `data/db` | SQLite、WAL 与 SHM |
| `data/staging` | 附件暂存 |
| `secrets` | 安装管理令牌、加密密钥及可选服务密钥 |
| `logs` | 应用轮转日志 |
| `backups` | 一致性快照与恢复前文件 |
| `releases` | 校验后的下载包与发布内容 |

Compose 只挂载本安装的相对目录；安装器不写固定全局工作路径。Docker 引擎本身的镜像层、网络和容器元数据属于已有 Docker 基础设施。应用关闭 Docker JSON 日志，业务日志写入相对 `logs/`。

CLI 校验容器的 Compose 工作目录归属，拒绝操作属于其他安装的同名容器；托管目录中的符号链接也会被拒绝。不会改其他应用、DNS、反代或邮件服务器的文件。

用户密码由 Stalwart 管理。Web 会话使用加密保存的限时上游凭据，写操作检查精确 Origin 和 CSRF。HTTPS 使用 Secure、HttpOnly 的 `__Host-` 会话 Cookie；显式启用的 HTTP 使用独立 Cookie 名称，不把它宣称为安全上下文。写信的幂等 ID 使用浏览器加密随机源，兼容显式 HTTP 下没有 `randomUUID()` 的情况，见 [Web Crypto 说明](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)。

## 8. 构建与发布维护

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend typecheck
pnpm --dir frontend build
node frontend/tooling/check-boundaries.mjs
node frontend/tooling/check-boundaries-fixtures.mjs
node tooling/check-persistence.mjs
node --test tests/scroll-hint.test.mjs tests/motion-styles.test.mjs tests/operation-id.test.mjs tests/admin-access.test.mjs
cargo fmt --all -- --check
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo run --locked -p mail-web -- --openapi > backend/contract/openapi.json
pnpm --dir frontend exec openapi-typescript ../backend/contract/openapi.json -o apps/web/src/lib/generated-api.ts
```

API 契约从 Rust/Utoipa 生成，生成文件不手改。GitHub Actions 完成检查与隔离 Stalwart 测试后，版本标签或带 `[release-preview]` 的 main 提交会发布：`mail-web-linux-amd64.tar.gz`、`SHA256SUMS` 和 `release-manifest.json`。维护者应更新 `release-version.txt` 为新的唯一版本，不覆盖已发布版本。稳定版仍受 `docs/acceptance.json` 门禁约束。

发布包含完整镜像、CLI、Compose、教程和接口契约。SHA-256 用于验证下载完整性，发布来源仍依赖 GitHub 仓库和发布权限。发布后 CI 再从公开直链执行干净安装、重复安装、备份和恢复；失败的发布会被转为草稿。

前端基础包来自 `reina0721/console-web` 提交 `7a159d8908120f34e6444df932496cf1dc273349`。HeroUI／React Aria 是 UI adapter 的底层实现。组件规范与动效检查页位于 `/ui-elements/`，详见 [组件检查记录](docs/ui-component-review.md)。

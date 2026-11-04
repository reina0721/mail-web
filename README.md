# Mail Web

独立 Webmail：Next.js 静态页面由 Rust/Axum 提供；SQLite 保存平台数据，现有 Stalwart 保存邮件。注册地址固定为 `@iqwq.com`。当前为开发预览，**公开注册默认关闭**；验收状态见 [docs/acceptance.json](docs/acceptance.json)。不能将构建成功等同于生产验收完成。

## 运行与安装

生产安装目录 `/workapps/mail-web`。Linux AMD64、Docker Compose、curl、jq、openssl、tar、sha256sum 和 flock 为宿主机依赖。现有 Stalwart 必须已运行，应用接入其 Docker 网络。首版仅支持单应用实例和 SQLite，不支持通过替换连接地址直接切换 MySQL。

发布包通过 GitHub Release 下载，校验后 `docker load`，Compose 使用本地镜像。目标服务器不执行 `docker pull` 或源码编译。

```sh
curl -fSL https://raw.githubusercontent.com/reina0721/mail-web/main/deploy/install.sh -o install-mail-web.sh
sh install-mail-web.sh v0.1.0-alpha.1
# 或省略版本，使用最新稳定版；尚无稳定版时明确失败。
```

安装后编辑项目 `.env`。设置实际 `PUBLIC_ORIGIN`、Stalwart 地址、网络及服务配置，再执行 `sh /workapps/mail-web/deploy/mail-web.sh start`。从任何工作目录调用工具，数据均以脚本所属安装目录为根。

默认入口 `127.0.0.1:18090`，容器内部 `0.0.0.0:8080`。本项目不配置 DNS、Nginx、域名跳转或证书。自行配置 HTTPS 反代；Cookie 始终为 Secure，HTTP 公网访问不支持登录。代理应保留正确 Host/Origin，SSE 禁用缓冲、允许长连接。应用不依据任意转发头改变来源或授权。

## 项目数据

Compose 仅使用 `./data`、`./logs`、`./config`、`./secrets`、`./backups` 相对映射。SQLite 数据库、WAL 和 SHM 位于 `data/db`，附件暂存于 `data/staging`。Docker 引擎自身元数据和镜像层属于运行基础设施。

`secrets/session.key` 为 32 字节加密密钥的十六进制表示，丢失后无法解密会话凭据。以下文件均不入 Git、不进入镜像：

| 文件 | 用途 |
|---|---|
| `provisioning.key` | 独立开户服务身份的 Stalwart API 密钥 |
| `notification.key` | 独立验证邮件发送账号的 API 密钥 |
| `turnstile.key` | Cloudflare Turnstile Secret |
| `mta-hook.key` | 内部提交策略认证 |
| `session.key` | 数据库中上游用户凭据的加密 |

初始化工具 `deploy/bootstrap-stalwart.sh` 使用临时管理凭据建立服务身份，随后 `deploy/setup-hook.sh` 建立初始范围为空的 Hook。工具不会修改管理员密码或邮件域名。将生成的 `config/domain-id`、`config/no-reply.account-id`、`config/mta-hook-id` 分别填入 `.env` 的 `STALWART_DOMAIN_ID`、`NOTIFICATION_ACCOUNT_ID`、`STALWART_HOOK_ID`。临时管理员密钥应在初始化完成后撤销，不作为运行配置。

初始运营身份独立创建，不能直接接管已有管理员。先在 `secrets/operator.initial-password` 写入不少于 16 字符的初始密码，再运行：

```sh
docker compose run --rm --no-deps --pull never mail-web --init-operator operator@iqwq.com your-existing-external@example.net /app/secrets/operator.initial-password
```

请替换外部邮箱；运营角色只存在于平台，Stalwart 中仍是普通邮箱用户。命令在上游结果不明时保留待核对记录，不自动接管、删除或重复创建账号。

## 身份和邮件

用户密码仅由 Stalwart 管理。登录时创建 8 小时到期的用户级 API 凭据，AES-GCM 加密保存在 SQLite；浏览器仅持有不透明会话 Cookie。空闲期限 30 分钟，写入请求校验 Origin 和 CSRF。运营身份和普通邮箱分权，邮件 API 使用该用户本人的凭据。

邮箱、邮件、草稿和附件以 Stalwart 为准。数据库仅保存身份关联、验证、会话、计数、任务、审计和幂等记录。结果未知的邮件提交只能查询核对，不自动重新发送。服务器接受不表示收件人已送达。

提交 Hook 使用 SQLite 原子计数，并限定到平台账号。新账号在 Hook 范围同步前禁止协议认证；Stalwart 中的范围规则在应用停机时仍保留。必须完成 SMTP、原生 JMAP、Webmail、服务故障和重启验收后才设置 `MTA_POLICY_VERIFIED=true`。该开关是部署验收声明，不会代替验收。

注册还需要 Turnstile Site Key/Secret、有效验证邮件账号和受控外部邮箱往返测试。最后由运营后台开放注册。当前验收未完成，保持关闭。

## 更新、备份和恢复

```sh
sh /workapps/mail-web/deploy/mail-web.sh status
sh /workapps/mail-web/deploy/mail-web.sh backup
sh /workapps/mail-web/deploy/mail-web.sh update v0.1.0-alpha.2
sh /workapps/mail-web/deploy/mail-web.sh restore /workapps/mail-web/backups/<snapshot>
```

数据库备份使用 `VACUUM INTO` 一致性快照，包含已提交 WAL 数据；配置和密钥一并保存，备份属于敏感文件。恢复先停服务、校验文件、保存原数据库，再恢复匹配版本并撤销恢复出的会话。迁移不保证向后兼容，回滚要求匹配的更新前备份及本地旧镜像。工具不自动清理历史备份、业务数据或旧镜像。请自行维护项目目录之外的离线备份副本。

## 开发与检查

```sh
corepack enable
pnpm --dir frontend install --frozen-lockfile
node frontend/tooling/check-boundaries.mjs
node frontend/tooling/check-boundaries-fixtures.mjs
pnpm --dir frontend typecheck
pnpm --dir frontend build
cargo fmt --all -- --check
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo run --locked -p mail-web -- --openapi > backend/contract/openapi.json
pnpm --dir frontend exec openapi-typescript ../backend/contract/openapi.json -o apps/web/src/lib/generated-api.ts
```

API 契约由 Rust 类型及 Utoipa 注解生成，位于 `backend/contract/openapi.json`；生成前端类型不得手改。接口不暴露通用 JMAP 代理。真实 Stalwart 隔离测试工具位于 `tests/`，不使用生产凭据，不替代外部往返验收。

前端基础包及架构门禁来自 `reina0721/console-web` 提交 `7a159d8908120f34e6444df932496cf1dc273349`。原项目未修改。未引入原项目的 Mock 认证配置或业务 Surface。邮箱与运营页面在 `frontend/apps/web/src/features`，App Router 固定页面位于 `src/app`。

GitHub Actions 检查成功后，版本标签生成镜像归档、校验值及包含实际 SQLite 版本的清单。预发布版本明确标为开发预览；稳定版发布受到 `docs/acceptance.json` 门禁约束。


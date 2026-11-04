# Plugin Framework 开发约束

本目录是 `@community-go/plugin-framework`：Plugin 契约与纯模型层
（Plugin Contract、Route Target、Registry、Navigation Resolution、Diagnostics、
Host Port / Host Capability、Route Context、Navigation Contract 子路径）。

- 本目录只定义类型、纯规则与可独立测试的模型；**不实现 Router、不读取 pathname、
  不维护 history、不复制 Next Route Runtime**。唯一真实 Router 是 Next.js App Router，
  其实现只存在于 Host（`apps/web`）的 Port adapter。
- Plugin 只通过 `@community-go/plugin-framework/plugin` 子路径消费 API
  （`route`/`RouteLink`/`usePluginNavigation`/`usePluginLocale`/稳定
  Page/Layout/Loading/Error props）；Route Context 通过 `/route-context` 子路径消费；
  Sidebar Navigation Contribution 类型经 `/navigation` 子路径（navigation-contract.ts）。
  禁止 Framework 内部深相对导入外泄。
- Registry / Navigation Resolution 统一负责 canonical hierarchy、route 级
  activeNavigationId 派生、Sidebar Group → Parent → Child resolution
  （`navigation-resolution.ts` 单一 authority：Group Alias 聚合、namespace 校验、
  routeId 静态 target gate、orphan、排序）、breadcrumb、command/permission、
  Route Target resolution 与 ownership/legacy/topology diagnostics；
  Generator（`tooling/plugin-codegen`）不生成 resolved model，只产出静态
  descriptors/aliases/contributions/catalog/bridges。
- Sidebar 模型固定 Group → Parent → Child：`groupId` 选择 plugins 范围公共 Group
  Alias（Surface `plugins/navigation-groups.ts`，本包不持有具体 Alias 表）；
  `navigationId` 必须 `${pluginId}.` namespace；层级用内嵌 children（无
  parentNavigationId / 跨 Plugin parent）；Sidebar 可见 Node routeId 必须静态可解析。
  `iconId` 是 opaque semantic presentation metadata，本包只透传不校验
  （合法 vocabulary 由 Surface `navigation-icon.ts` 治理）。
- 具体 Route Catalog 由 Surface generated catalog 提供，**不得生成到本包**；
  本包只定义可扩展 Catalog protocol。
- Host Capability：Static Export Host 对动态 `[param]` Route 返回
  `UNSUPPORTED_DYNAMIC_PLUGIN_ROUTE` 并硬失败，不降级为 warning、不使用
  `generateStaticParams` 枚举业务实体；Framework Contract 合法 ≠ 当前 Host 可部署。
- 错误必须完整向上导出：Registry/Route Target/Navigation Resolution 校验失败保留
  code 与消息，不静默回退默认值。
- 允许依赖 Universal（`core`、`types`）与 react（作为 plugin/route-context 的 peer 运行时）；
  禁止依赖 Next、Browser/Desktop API、`surface-foundation` 视觉包或 `apps/*`。
- 修改契约/Registry/Navigation Resolution 前先读
  [Plugin Framework 与 Surface File Routes](../../docs/plugin-framework.md)；
  公共导出登记在 `tooling/foundation-contracts.json`。

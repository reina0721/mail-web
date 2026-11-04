# Surface Foundation 开发约束

- 本目录只拥有当前产品 Surface 的稳定 Layout、Shell 表现、UX Pattern、Page Archetype 与 Motion Recipe。
- 允许依赖 Universal Foundation，禁止依赖 `apps/*`、Next、Browser/Desktop API、后端 DTO、请求、Session 或权限实现。
- 组件只接收业务已决定的内容、状态、权限呈现和动作，不读取数据或计算业务规则。
- 新 Pattern 必须至少覆盖两个独立后台业务场景，并在 `/page-patterns` 与 `/page-archetypes` 中分别证明 Contract 和完整组合。
- 不得把 Product Surface 差异抽象成万能 Pattern；未来 Product Foundation 必须单独建立。

## Shell Navigation 展开状态约束（Active Path Anchored Accordion）

- Sidebar 可展开菜单的展开状态由 Navigation Tree 统一管理（scope -> exploration branch），Menu Item 不得各自维护独立 `isOpen`；禁止用 CSS 隐藏其它菜单模拟手风琴。
- visual group 只是视觉分类标题，不等于 Accordion parent：顶层所有 Branch 共享 `root` scope（跨 visual group 竞争）；真实嵌套 Branch 的下一层才用该 Branch 的 navigationId 作 scope。规则递归适用于任意深度。
- active 状态与展开/探索状态是两个独立状态模型：active ancestor chain 由当前 Route 推导并始终展开；active ancestor 不允许被普通 toggle 收起到隐藏当前 Route。
- `exploration` 是瞬时用户意图，不是历史展开记录：真实 Route Commit 后立即失效并清空（渲染门控 + 清理 effect），由新 Active Path 重算必要展开链；same-route no-op 保留。收起/替换 exploration branch 时必须同步清理其子树内全部 exploration scope。
- Compact Flyout 的打开（`openBranchId`）与 Expanded Tree 的 exploration 分离：hover/open Flyout 不写入 `exploration['root']`。
- 上述 Policy 的纯函数放在本目录（如 `shell-navigation-accordion.ts`），不沉淀到 Core（Core 只保留通用 tree traversal / ancestor lookup）。

## Section 宿主组合约束（Panel / Section）

- `Panel` / `Section` 是容器与内容布局的所有者：边界、horizontal inset、divider、section padding 与区域关系由本层提供；子组件（如 `TabsView variant="section"`）不自建 Surface/Toolbar/整条 divider 制造分区感。
- 需要「章节导航 + 内容共享父容器内容边界」的组合时，使用 `Section` 的 `contentInset` 或 `SectionBody`（统一 horizontal inset 与稳定间距），禁止各调用方手写 px/py/gap/divider 拼凑宿主布局，也禁止把 section composition 下沉到 ui-adapter 或扩大的 Tabs 视觉职责。

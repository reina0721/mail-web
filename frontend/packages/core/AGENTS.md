# Core 开发约束

- Core 只承载纯规则与稳定共享语义，不导入 React、HeroUI、浏览器、Desktop Runtime、网络客户端或构建工具。
- 函数输入输出必须可序列化或由稳定 TypeScript 类型表达；不得依赖全局状态和隐式初始化。
- Schema 校验属于 `packages/schemas`，跨模块形状属于 `packages/types`；不要在 Core 复制定义。
- 新抽象必须说明隔离的变化与至少一个当前调用场景，禁止空 Factory、Manager、Provider、Service 和 re-export 层。

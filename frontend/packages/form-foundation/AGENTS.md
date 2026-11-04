# Form Foundation 开发约束

- 本目录是 React Hook Form 与 `@hookform/resolvers` 的唯一直接依赖边界。
- 只收口跨 Surface 稳定的表单生命周期：Schema、dirty、pending、reset、错误聚焦与受控字段桥接。
- 具体字段、默认值、业务 Schema、错误文案、提交副作用和离开确认由 Feature、Surface 或 Host 提供。
- 公共类型不得暴露 React Hook Form 的 `UseFormReturn`、`Control`、`ControllerRenderProps` 等 vendor 类型。
- 不建立后端 DTO、服务端错误、请求或权限抽象。

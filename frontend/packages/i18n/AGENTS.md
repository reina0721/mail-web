# i18n Foundation 开发约束

- 本目录是 i18next 与 react-i18next 的唯一直接依赖边界。
- Universal 只拥有 runtime factory、Provider、translation hook 和 Intl formatter；支持语言、资源、业务文案与 fallback 由 Surface 注入。
- 不在本目录写 Surface/Product 文案，不读取 Browser Storage，不决定用户 locale。
- 日期、数字、单位和相对时间统一通过本包格式化；Feature 不直接创建 `Intl.*Format`。

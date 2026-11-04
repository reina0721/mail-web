/**
 * Plugin Framework —— Route Target 子路径（纯模块，Server/Client 均可 import）。
 *
 * `@community-go/plugin-framework/target` 只含纯函数与类型：route() 创建 symbolic
 * target、encodeSegment/resolveTargetHref 构造 href。无 React/Next/浏览器依赖，
 * Server Component 与 Client Component 均可安全 import。
 *
 * Plugin 导航方式：普通静态导航可直接用 `next/link`/`useRouter`（Plugin route
 * 模块受控 Next 白名单内）；跨 Plugin 稳定引用或需参数校验时用 route() target。
 * Route Target 是增强能力，不是替代 Next 原生导航的强制方式。
 */

export { route, encodeSegment, resolveTargetHref } from './target';
export type { RouteTarget } from './target-types';

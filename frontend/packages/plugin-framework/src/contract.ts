/**
 * Plugin Framework —— 插件契约与静态 File Route 描述符。
 *
 * 本模块只定义类型与纯规则，不包含 React、Next 或 Browser 依赖。
 * Framework 不进行 pathname matching、不维护 history、不复制 Next Route Runtime；
 * Next.js App Router 是唯一真实 Router，具体导航由 Host Navigation Port 承载。
 */

/** 静态 URL 段：普通文本段或 `[param]` 动态段。 */
export type RouteSegment = string;

/** Plugin 定义：目录名与 pluginId 一致，mount 为静态前缀（默认 `/<plugin-directory>`）。 */
export type PluginDefinition = Readonly<{
  pluginId: string;
  mount: string;
}>;

/**
 * Sidebar Navigation Group Alias（plugins 范围公共 IA）。
 *
 * Group 是侧边栏分组/分隔区域，不是 Route、不是父菜单。普通 Plugin 不定义 Group，
 * 只在自身 Navigation Contribution 中按 groupId 选择既有 Alias。新增 Alias 属
 * plugins 范围公共 IA Contract 变更，不是单个 Plugin 私有声明。
 */
export type NavigationGroupAlias = Readonly<{
  groupId: string;
  labelKey: string;
  order?: number;
}>;

/**
 * Plugin Navigation Contribution：显式声明 Sidebar 的 Parent/Child 层级。
 *
 * 模型：Sidebar = Group → Parent → Child。
 * - Parent 的 children 内嵌表达层级（无 parentNavigationId / 跨 Plugin parent 概念）；
 * - Child 天然属于声明它的 Parent / Plugin / Group（不声明 groupId）；
 * - navigationId 必须 `${pluginId}.` 前缀（Parent/Child 均如此）；
 * - routeId 必须静态可解析（无 runtime params）才能作为可见 Sidebar target。
 */
export type NavigationContribution = Readonly<{
  parents: readonly NavigationParent[];
}>;

export type NavigationParent = Readonly<{
  navigationId: string;
  labelKey: string;
  groupId: string;
  order?: number;
  /** 可选 semantic presentation metadata（受控 icon vocabulary）。 */
  iconId?: string;
  /** 有 routeId → Parent 可导航（静态 target）；无 routeId → 纯 Disclosure（只展开/收起）。 */
  routeId?: string;
  children?: readonly NavigationChild[];
}>;

export type NavigationChild = Readonly<{
  navigationId: string;
  labelKey: string;
  /** 必须、静态可解析（见 Sidebar target gate）。 */
  routeId: string;
  order?: number;
  iconId?: string;
}>;

/**
 * 静态 Framework Descriptor：由 Generator 从 Plugin mount + Next 文件树确定性派生。
 *
 * 这是**当前 Plugin 管理功能（Navigation target 校验、Route Target、冲突诊断）需要的
 * Page Route 索引**，不是 Next 完整 Route Tree 的平行模型——Next 完整 Route Tree 由
 * Next 文件系统本身拥有与解释，Framework 不尝试完整建模。
 */
export type FileRouteDescriptor = Readonly<{
  routeId: string;
  pluginId: string;
  /** 相对 plugin routes/ 根目录的文件树路径，如 `create`、`[id]/edit`。 */
  path: string;
  /** 文件树段（含 `[param]` 标记）。 */
  segments: readonly RouteSegment[];
  /** URL pattern（含 `[param]` 占位），如 `/users/[id]`。 */
  pattern: string;
  /** 动态参数名集合（来自 `[param]` 段）。 */
  paramNames: readonly string[];
}>;

/** Surface Catalog：generated 静态目录，Registry 只消费该模型。 */
export type RouteCatalog = Readonly<{
  plugins: readonly PluginDefinition[];
  routes: readonly FileRouteDescriptor[];
  /** plugins 范围公共 Group Alias（IA）。 */
  aliases: readonly NavigationGroupAlias[];
  /** 每 Plugin 的 Sidebar Navigation Contribution（带 pluginId 归属，供 namespace 校验）。 */
  contributions: readonly PluginNavigationContribution[];
}>;

/** 带 pluginId 归属的 Navigation Contribution。 */
export type PluginNavigationContribution = Readonly<{
  pluginId: string;
  contribution: NavigationContribution;
}>;

/** 判定段是否为动态段 `[param]`。 */
export function isDynamicSegment(segment: string): boolean {
  return /^\[[A-Za-z0-9_]+]$/.test(segment);
}

/** 提取动态段参数名；非动态段返回 null。 */
export function dynamicParamName(segment: string): string | null {
  const match = /^\[([A-Za-z0-9_]+)]$/.exec(segment);
  return match?.[1] ?? null;
}

/** 由 plugin mount + 文件树段构造 URL pattern。 */
export function buildRoutePattern(mount: string, segments: readonly RouteSegment[]): string {
  const path = segments.length > 0 ? `/${segments.join('/')}` : '';
  return `${mount}${path}`;
}

/** 提取 pattern 中的动态参数名（按出现顺序）。 */
export function collectParamNames(pattern: string): readonly string[] {
  const names: string[] = [];
  for (const match of pattern.matchAll(/\[([A-Za-z0-9_]+)]/g)) {
    const name = match[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

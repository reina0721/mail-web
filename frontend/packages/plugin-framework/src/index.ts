/**
 * Plugin Framework —— 公共入口。
 *
 * Framework 只定义可扩展 Catalog protocol 与静态模型；
 * 具体 Route Catalog 由 Surface generated catalog 提供（surfaces/generated/），
 * 不生成到 Framework。
 */

export {
  isDynamicSegment,
  dynamicParamName,
  buildRoutePattern,
  collectParamNames,
  type PluginDefinition,
  type RouteSegment,
  type NavigationGroupAlias,
  type NavigationContribution,
  type NavigationParent,
  type NavigationChild,
  type PluginNavigationContribution,
  type FileRouteDescriptor,
  type RouteCatalog,
} from './contract';

export type { Diagnostic, DiagnosticCode, Diagnostics } from './diagnostics';
export { collectDiagnostics, finalizeDiagnostics, formatDiagnostics } from './diagnostics';

export type { RegistryModel } from './registry';
export type {
  ResolvedNavigationGroup,
  ResolvedNavigationParent,
  ResolvedNavigationChild,
} from './registry';
export { createRegistry, resolveRouteTarget, hasDynamicSegments } from './registry';
export {
  resolveNavigationWithPlugins,
  navigationIdInPluginNamespace,
  UNKNOWN_NAVIGATION_GROUP,
  NAVIGATION_NAMESPACE_VIOLATION,
  UNKNOWN_NAVIGATION_ROUTE_TARGET,
  NAVIGATION_DYNAMIC_TARGET_UNSUPPORTED,
  NAVIGATION_NODE_ORPHAN,
} from './navigation-resolution';

export {
  HOST_MODE_CANNOT_DEPLOY,
  analyzeHostCapability,
  type HostDeploymentMode,
  DEFAULT_DEPLOYMENT_MODE,
  type HostCapabilityResult,
  type HostNavigationPort,
  type RouteTargetResolver,
} from './host';

export type { RouteTarget } from './target-types';
export { route, encodeSegment, resolveTargetHref } from './target';

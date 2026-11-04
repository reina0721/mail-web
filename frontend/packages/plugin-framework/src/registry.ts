/**
 * Plugin Framework —— Registry。
 *
 * Registry 统一负责（只保留 Plugin 自动装配、Navigation target 校验、Route identity
 * 与冲突诊断真实需要的结构）：
 * - routeId / pattern / pluginId 唯一性与归属校验（冲突诊断）
 * - routeId → descriptor 纯索引（Route Target 解析与校验用）
 * - Sidebar Navigation resolution（Group → Parent → Child，Shell 唯一导航数据源）
 * - diagnostics 汇总（composition assert 消费）
 *
 * 不做（无运行时消费者，不为"未来可能使用"维护）：
 * - canonical hierarchy / activeNavigationId 派生（Shell active 由 href 匹配真实 Router）
 * - breadcrumb / command / permission 展示模型
 * - registry 级 orphan（Route 没有 Navigation 是正常情况；只保留
 *   Navigation → 不存在 Route 的反向校验，见 navigation-resolution）
 *
 * Registry 是纯函数模型，不读取 pathname、不创建导航栈、不实现 Router。
 * 唯一真实 Router 与 Route Lifecycle authority 是 Next.js App Router；
 * Framework 不平行建模 Next Route Tree。
 */

import type { FileRouteDescriptor, PluginNavigationContribution, RouteCatalog } from './contract';
import { isDynamicSegment } from './contract';
import type { Diagnostic } from './diagnostics';
import { collectDiagnostics } from './diagnostics';
import {
  resolveNavigationWithPlugins,
  type ResolvedNavigationGroup,
} from './navigation-resolution';
import { resolveTargetHref } from './target';
import type { RouteTarget } from './target-types';

/** Registry 解析结果：catalog + routeId→descriptor 索引 + resolved Sidebar + diagnostics。 */
export type RegistryModel = Readonly<{
  catalog: RouteCatalog;
  /** routeId → descriptor 纯索引（Route Target 解析与校验用）。 */
  routes: Readonly<Record<string, FileRouteDescriptor>>;
  /** Resolved Sidebar model（Group → Parent → Child），Shell 唯一导航数据源。 */
  navigation: readonly ResolvedNavigationGroup[];
  diagnostics: readonly Diagnostic[];
}>;

export type {
  ResolvedNavigationGroup,
  ResolvedNavigationParent,
  ResolvedNavigationChild,
} from './navigation-resolution';

/** 构造 Registry：输入静态 catalog，输出 resolved model。 */
export function createRegistry(catalog: RouteCatalog): RegistryModel {
  const errors: Diagnostic[] = [];
  const routesByRouteId: Record<string, FileRouteDescriptor> = {};
  const routeIds = new Set<string>();
  const patterns = new Set<string>();
  const pluginById = new Map(catalog.plugins.map((plugin) => [plugin.pluginId, plugin]));

  // 1. 校验 routeId/pattern 唯一性与 plugin 归属，建立 routeId → descriptor 索引。
  for (const descriptor of catalog.routes) {
    if (routeIds.has(descriptor.routeId)) {
      collectDiagnostics(errors, {
        code: 'DUPLICATE_ROUTE_ID',
        routeId: descriptor.routeId,
        message: `重复 routeId: ${descriptor.routeId}`,
      });
      continue;
    }
    routeIds.add(descriptor.routeId);
    if (patterns.has(descriptor.pattern)) {
      collectDiagnostics(errors, {
        code: 'DUPLICATE_PATTERN',
        routeId: descriptor.routeId,
        message: `重复 pattern: ${descriptor.pattern}`,
      });
    }
    patterns.add(descriptor.pattern);
    const plugin = pluginById.get(descriptor.pluginId);
    if (!plugin) {
      collectDiagnostics(errors, {
        code: 'UNKNOWN_ROUTE',
        routeId: descriptor.routeId,
        message: `pluginId 不存在: ${descriptor.pluginId}`,
      });
    }
    routesByRouteId[descriptor.routeId] = descriptor;
  }

  // 2. Sidebar Navigation resolution：aliases + contributions → Group → Parent → Child。
  //    （navigation-resolution 内部完成 Sidebar Node routeId 引用合法性校验：
  //    UNKNOWN_NAVIGATION_ROUTE_TARGET / NAVIGATION_DYNAMIC_TARGET_UNSUPPORTED /
  //    NAVIGATION_NODE_ORPHAN —— Navigation → 不存在 Route 的反向校验。）
  const navigationResult = resolveNavigationWithPlugins({
    aliases: catalog.aliases,
    contributionsByPlugin: catalog.contributions.map((entry: PluginNavigationContribution) => ({
      pluginId: entry.pluginId,
      contribution: entry.contribution,
    })),
    routes: catalog.routes,
  });
  for (const diagnostic of navigationResult.diagnostics) collectDiagnostics(errors, diagnostic);

  return {
    catalog,
    routes: routesByRouteId,
    navigation: navigationResult.groups,
    diagnostics: errors,
  };
}

/** 解析 Route Target 为 href；校验 routeId 与缺失/多余 params。 */
export function resolveRouteTarget(
  registry: RegistryModel,
  target: RouteTarget,
): { href: string; diagnostics: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  const descriptor = registry.routes[target.routeId];
  if (!descriptor) {
    collectDiagnostics(errors, {
      code: 'UNKNOWN_ROUTE',
      routeId: target.routeId,
      message: `未知 routeId: ${target.routeId}`,
    });
    return { href: '', diagnostics: errors };
  }

  const paramNames = descriptor.paramNames;
  for (const name of paramNames) {
    if (target.params[name] === undefined) {
      collectDiagnostics(errors, {
        code: 'MISSING_PARAMS',
        routeId: target.routeId,
        message: `缺少参数 ${name}`,
      });
    }
  }
  for (const name of Object.keys(target.params)) {
    if (!paramNames.includes(name)) {
      collectDiagnostics(errors, {
        code: 'EXTRA_PARAMS',
        routeId: target.routeId,
        message: `多余参数 ${name}`,
      });
    }
  }

  const query = Object.entries(target.query ?? {})
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value))
    .join('&');
  const fragment = target.fragment ? '#' + encodeURIComponent(target.fragment) : '';
  return {
    href:
      resolveTargetHref(descriptor.pattern, target.params) + (query ? '?' + query : '') + fragment,
    diagnostics: errors,
  };
}

/** 判断 pattern 是否含动态段。 */
export function hasDynamicSegments(pattern: string): boolean {
  return pattern.split('/').some((segment) => isDynamicSegment(segment));
}

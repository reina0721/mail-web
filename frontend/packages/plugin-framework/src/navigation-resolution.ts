/**
 * Plugin Framework —— Navigation Resolution（Sidebar 模型单一 authority）。
 *
 * Sidebar 固定模型：Group → Parent → Child。
 * - Group   来自 plugins 范围公共 Alias（catalog.aliases）；
 * - Parent/Child 来自每 Plugin Navigation Contribution（内嵌 children 表达层级）。
 *
 * 本模块只做纯解析/校验/排序，无副作用；codegen gate、Registry、Surface assert
 * 共用同一实现，保证合法性规则与 diagnostic code/message 单一来源。
 * - Child 天然属于声明它的 Parent / Plugin / Group（无 parentNavigationId / 跨 Plugin 概念）；
 * - Parent 有 routeId → 可导航；无 routeId → 纯 Disclosure（无 href，Shell 只展开/收起）；
 * - Sidebar 可见 Node 的 routeId 必须静态可解析（无 runtime params）。
 */

import type { FileRouteDescriptor, NavigationContribution, NavigationGroupAlias } from './contract';
import type { Diagnostic } from './diagnostics';
import { collectDiagnostics } from './diagnostics';
import { resolveTargetHref } from './target';

export const UNKNOWN_NAVIGATION_GROUP = 'UNKNOWN_NAVIGATION_GROUP';
export const NAVIGATION_NAMESPACE_VIOLATION = 'NAVIGATION_NAMESPACE_VIOLATION';
export const UNKNOWN_NAVIGATION_ROUTE_TARGET = 'UNKNOWN_NAVIGATION_ROUTE_TARGET';
export const NAVIGATION_DYNAMIC_TARGET_UNSUPPORTED = 'NAVIGATION_DYNAMIC_TARGET_UNSUPPORTED';
export const NAVIGATION_NODE_ORPHAN = 'NAVIGATION_NODE_ORPHAN';

/** Resolved Child（可导航 leaf）。 */
export type ResolvedNavigationChild = Readonly<{
  navigationId: string;
  labelKey: string;
  href: string;
  iconId?: string;
}>;

/** Resolved Parent：可导航（有 href）或纯 Disclosure（无 href）。 */
export type ResolvedNavigationParent = Readonly<{
  navigationId: string;
  labelKey: string;
  groupId: string;
  iconId?: string;
  href?: string;
  children: readonly ResolvedNavigationChild[];
}>;

/** Resolved Sidebar Group。 */
export type ResolvedNavigationGroup = Readonly<{
  groupId: string;
  labelKey: string;
  order?: number;
  parents: readonly ResolvedNavigationParent[];
}>;

export type NavigationResolutionInput = Readonly<{
  aliases: readonly NavigationGroupAlias[];
  routes: readonly FileRouteDescriptor[];
}>;

export type NavigationResolutionResult = Readonly<{
  groups: readonly ResolvedNavigationGroup[];
  diagnostics: readonly Diagnostic[];
}>;

/** 校验 navigationId 是否处于 pluginId namespace。 */
export function navigationIdInPluginNamespace(navigationId: string, pluginId: string): boolean {
  return navigationId === pluginId || navigationId.startsWith(`${pluginId}.`);
}

/**
 * 解析全部 contributions（含 pluginId 归属）→ resolved groups。
 * contributions 以 { pluginId, contribution } 列表传入，保证 namespace 校验可执行。
 */
export function resolveNavigationWithPlugins(
  input: NavigationResolutionInput & {
    contributionsByPlugin: readonly Readonly<{
      pluginId: string;
      contribution: NavigationContribution;
    }>[];
  },
): NavigationResolutionResult {
  const errors: Diagnostic[] = [];
  const aliasByGroup = new Map(input.aliases.map((alias) => [alias.groupId, alias]));
  const routeById = new Map(input.routes.map((route) => [route.routeId, route]));

  const routeHref = (routeId: string): { href: string | undefined; diagnostics: Diagnostic[] } => {
    const route = routeById.get(routeId);
    if (!route) {
      return {
        href: undefined,
        diagnostics: [
          {
            code: UNKNOWN_NAVIGATION_ROUTE_TARGET,
            routeId,
            message: `Sidebar Node 引用不存在的 routeId: ${routeId}`,
          },
        ],
      };
    }
    if (route.paramNames.length > 0) {
      return {
        href: undefined,
        diagnostics: [
          {
            code: NAVIGATION_DYNAMIC_TARGET_UNSUPPORTED,
            routeId,
            message: `Sidebar Node 不能引用动态 Route（需无 runtime params 静态解析）: ${routeId}`,
          },
        ],
      };
    }
    return { href: resolveTargetHref(route.pattern, {}), diagnostics: [] };
  };

  // 1. 展开 parents（含 children），按 groupId 归组并记录原始声明顺序。
  const parentsByGroup = new Map<string, { resolved: ResolvedNavigationParent; order: number }[]>();
  for (const { pluginId, contribution } of input.contributionsByPlugin) {
    for (const parent of contribution.parents) {
      // namespace 校验
      if (!navigationIdInPluginNamespace(parent.navigationId, pluginId)) {
        collectDiagnostics(errors, {
          code: NAVIGATION_NAMESPACE_VIOLATION,
          routeId: parent.navigationId,
          message: `Parent navigationId 必须为 ${pluginId}.* namespace: ${parent.navigationId}`,
        });
        continue;
      }
      // alias 校验
      const alias = aliasByGroup.get(parent.groupId);
      if (!alias) {
        collectDiagnostics(errors, {
          code: UNKNOWN_NAVIGATION_GROUP,
          routeId: parent.navigationId,
          message: `Parent 引用不存在的 Group Alias: ${parent.groupId}（${parent.navigationId}）`,
        });
        continue;
      }
      // Parent 自身 routeId（可选）：有则必须静态可解析
      let parentHref: string | undefined;
      if (parent.routeId !== undefined) {
        const parentTarget = routeHref(parent.routeId);
        parentHref = parentTarget.href;
        for (const d of parentTarget.diagnostics) collectDiagnostics(errors, d);
      }
      // children 解析（携带声明 order，最终按 order/navigationId 排序）
      const childEntries: { resolved: ResolvedNavigationChild; order: number }[] = [];
      for (const child of parent.children ?? []) {
        if (!navigationIdInPluginNamespace(child.navigationId, pluginId)) {
          collectDiagnostics(errors, {
            code: NAVIGATION_NAMESPACE_VIOLATION,
            routeId: child.navigationId,
            message: `Child navigationId 必须为 ${pluginId}.* namespace: ${child.navigationId}`,
          });
          continue;
        }
        const childTarget = routeHref(child.routeId);
        for (const d of childTarget.diagnostics) collectDiagnostics(errors, d);
        if (childTarget.href === undefined) continue;
        childEntries.push({
          resolved: {
            navigationId: child.navigationId,
            labelKey: child.labelKey,
            href: childTarget.href,
            ...(child.iconId ? { iconId: child.iconId } : {}),
          },
          order: child.order ?? Number.POSITIVE_INFINITY,
        });
      }
      // orphan：无 routeId 且无有效 children
      if (parent.routeId === undefined && childEntries.length === 0) {
        collectDiagnostics(errors, {
          code: NAVIGATION_NODE_ORPHAN,
          routeId: parent.navigationId,
          message: `Parent 无 routeId 且无 children（无法导航也无法展开）: ${parent.navigationId}`,
        });
        continue;
      }
      const children = childEntries
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.resolved.navigationId.localeCompare(b.resolved.navigationId);
        })
        .map((entry) => entry.resolved);
      const resolved: ResolvedNavigationParent = {
        navigationId: parent.navigationId,
        labelKey: parent.labelKey,
        groupId: parent.groupId,
        ...(parent.iconId ? { iconId: parent.iconId } : {}),
        ...(parentHref !== undefined ? { href: parentHref } : {}),
        children,
      };
      const list = parentsByGroup.get(parent.groupId) ?? [];
      list.push({
        resolved,
        order: parent.order ?? Number.POSITIVE_INFINITY,
      });
      parentsByGroup.set(parent.groupId, list);
    }
  }

  // 2. 组装 groups：alias order 排序；组内 parents 按 order/navigationId 排序。
  const groups: ResolvedNavigationGroup[] = [];
  for (const alias of [...input.aliases].sort((a, b) => aliasSortKey(a, b))) {
    const parents = (parentsByGroup.get(alias.groupId) ?? [])
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.resolved.navigationId.localeCompare(b.resolved.navigationId);
      })
      .map((entry) => entry.resolved);
    if (parents.length === 0) continue; // 无有效 Node 的 Group 不进最终 model
    groups.push({
      groupId: alias.groupId,
      labelKey: alias.labelKey,
      ...(alias.order !== undefined ? { order: alias.order } : {}),
      parents,
    });
  }

  return { groups, diagnostics: errors };
}

function aliasSortKey(a: NavigationGroupAlias, b: NavigationGroupAlias): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return a.groupId.localeCompare(b.groupId);
}

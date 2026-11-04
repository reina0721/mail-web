import type { NavigationBranch, NavigationLeaf, NavigationNode } from '@community-go/types';

export type NavigationLeafPath = Readonly<{
  leaf: NavigationLeaf;
  ancestors: readonly NavigationBranch[];
}>;

export function getFirstNavigationLeaf(node: NavigationNode): NavigationLeaf {
  return node.kind === 'leaf' ? node : getFirstNavigationLeaf(node.children[0]);
}

export function flattenNavigationLeaves(
  nodes: readonly NavigationNode[],
  ancestors: readonly NavigationBranch[] = [],
): readonly NavigationLeafPath[] {
  return nodes.flatMap((node) => {
    if (node.kind === 'leaf') return [{ leaf: node, ancestors }];
    return flattenNavigationLeaves(node.children, [...ancestors, node]);
  });
}

export function getNavigationTreeErrors(nodes: readonly NavigationNode[]): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const hrefs = new Set<string>();

  const visit = (node: NavigationNode) => {
    if (ids.has(node.id)) errors.push(`duplicate id: ${node.id}`);
    ids.add(node.id);

    if (node.kind === 'leaf') {
      if (hrefs.has(node.href)) errors.push(`duplicate href: ${node.href}`);
      hrefs.add(node.href);
      return;
    }

    // 纯 Disclosure Branch（无 defaultHref）没有自身导航目标，只展开/收起；
    // 不校验"defaultHref === 首 leaf href"。有 defaultHref 才校验一致性。
    if (node.defaultHref !== undefined && node.defaultHref !== getFirstNavigationLeaf(node).href) {
      errors.push(`invalid default href: ${node.id}`);
    }
    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return errors;
}

export function isNavigationHrefActive(href: string, pathname: string): boolean {
  const normalize = (value: string) => (value.length > 1 ? value.replace(/\/$/, '') : value);
  return normalize(href) === normalize(pathname);
}

/* ------------------------------------------------------------------ */
/* Resolved location 等价判断（导航 no-op 判定用，纯规则、无 DOM）      */
/* ------------------------------------------------------------------ */

export type ResolvedLocation = Readonly<{
  pathname: string;
  search: string;
  hash: string;
}>;

/**
 * 把 href 解析为 pathname/search/hash 三要素。
 * - 纯字符串处理，不依赖浏览器全局对象或 DOM（Core 可独立测试）。
 * - search 不包含前导 '?'；hash 不包含前导 '#'（与 URL API 返回一致，便于精确比较）。
 */
export function parseResolvedHref(href: string): ResolvedLocation {
  const hashIndex = href.indexOf('#');
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const searchIndex = withoutHash.indexOf('?');
  const search = searchIndex >= 0 ? withoutHash.slice(searchIndex + 1) : '';
  const pathname = searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash;
  return { pathname, search, hash };
}

/** search 参数归一化：key 无序、重复 key 内值有序；'' 与 '?' 视为同一。返回可比较的编码数组。 */
export function normalizeSearchForComparison(search: string): readonly string[] {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (raw === '') return [];
  const params = new URLSearchParams(raw);
  return [...params.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const byKey = leftKey.localeCompare(rightKey);
      return byKey !== 0 ? byKey : leftValue.localeCompare(rightValue);
    })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
}

/** pathname 规范化：长度 > 1 时去掉尾部 '/'（与 isNavigationHrefActive 一致）。 */
export function normalizePathnameForComparison(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * 两个最终 resolved location 是否等价：
 * - pathname 去尾斜杠比较（大小写敏感，符合浏览器语义）。
 * - search key 无序、值精确比较。
 * - hash 精确比较（'' 与 '#' 已在 parse 阶段归一为同值）。
 */
export function isResolvedNavigationEqual(a: ResolvedLocation, b: ResolvedLocation): boolean {
  if (normalizePathnameForComparison(a.pathname) !== normalizePathnameForComparison(b.pathname)) {
    return false;
  }
  const searchA = normalizeSearchForComparison(a.search).join('&');
  const searchB = normalizeSearchForComparison(b.search).join('&');
  if (searchA !== searchB) return false;
  return a.hash === b.hash;
}

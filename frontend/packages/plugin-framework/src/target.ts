/**
 * Plugin Framework —— Route Target。
 *
 * route() 只创建 symbolic target，不执行导航。Registry 使用 generated descriptors
 * 校验 routeId、缺失/多余 params，并逐段编码后构造 href。
 */

import type { RouteTarget } from './target-types';

export type { RouteTarget } from './target-types';

/** 创建 symbolic Route Target；不触发导航。 */
export function route<RouteId extends string = string>(
  routeId: RouteId,
  params: Readonly<Record<string, string>> = {},
  location?: Readonly<{ query?: Readonly<Record<string, string>>; fragment?: string }>,
): RouteTarget<RouteId> {
  return { routeId, params, ...location };
}

/** 编码单个段；动态段直接编码，静态段保持原样。 */
export function encodeSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/** 构造最终 href：将 pattern 中的 `[param]` 用已编码参数替换。 */
export function resolveTargetHref(
  pattern: string,
  params: Readonly<Record<string, string>>,
): string {
  return pattern.replace(/\[([A-Za-z0-9_]+)]/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return encodeSegment(value);
  });
}

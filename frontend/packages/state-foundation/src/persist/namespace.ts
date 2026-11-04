/**
 * Namespace 策略 —— 所有 Persistent Store 的稳定命名空间。
 *
 * 默认策略：`community-go.<scope>.<store>`（product / scope / store 三段，克制不过度分层）。
 * 必须兼容历史 key（如 community-go.shell）：scope 或 store 缺省时退化为
 * `community-go.<segment>`，保证迁移不换 key、老用户 preference 不丢。
 */
import { formatPersistKey, type PersistNamespace } from '../contract/persist';

/** 默认 product 前缀（与历史 community-go.shell 一致）。 */
export const DEFAULT_PRODUCT = 'community-go';

/** 从 scope + store 构造命名空间；支持省略 scope（历史单段 key）。 */
export function createNamespace(
  store: string,
  options?: Readonly<{ product?: string; scope?: string }>,
): PersistNamespace {
  const product = options?.product ?? DEFAULT_PRODUCT;
  const scope = options?.scope ?? '';
  if (!store || store.trim() === '') {
    throw new Error('Persist namespace: store 名不能为空');
  }
  return { product, scope, store };
}

/** 展开为最终 storage key（community-go.<scope>.<store> 或兼容单段 community-go.<store>）。 */
export function namespaceKey(namespace: PersistNamespace): string {
  return formatPersistKey(namespace);
}

/** 便捷：scope+store 直接得到 key。 */
export function createPersistKey(store: string, scope?: string): string {
  return namespaceKey(createNamespace(store, scope === undefined ? {} : { scope }));
}

/**
 * 校验 namespace 是否以产品前缀开头（防业务随意裸 key 如 "settings"）。
 * 返回 true 表示 key 属于受管 namespace；用于 diagnostics。
 */
export function isManagedKey(key: string, product: string = DEFAULT_PRODUCT): boolean {
  return key === product || key.startsWith(`${product}.`);
}

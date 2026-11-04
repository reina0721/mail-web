/**
 * rehydrateStore —— 命令式触发 hydration（Provider / Runtime 使用）。
 * 幂等：同一 store 已 hydrate 或正在 hydrate 时重复调用不重复执行。
 */
import type { StoreApi } from 'zustand/vanilla';

import { createHydrationLifecycle, getHydrationLifecycle } from './lifecycle';

export function rehydrateStore<S>(store: StoreApi<S>): boolean {
  const lifecycle = getHydrationLifecycle(store) ?? createHydrationLifecycle(store);
  return lifecycle.trigger();
}

/** 查询 store 是否已完成 hydration（无副作用）。 */
export function isStoreHydrated<S>(store: StoreApi<S>): boolean {
  const api = store as { persist?: { hasHydrated: () => boolean } };
  return api.persist?.hasHydrated() ?? false;
}

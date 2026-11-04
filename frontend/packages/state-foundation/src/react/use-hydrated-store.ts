/**
 * useHydratedStore —— React hydration 门控 hook。
 *
 * 封装 store-scoped lifecycle：自动幂等触发一次 hydration，返回 hydrated 状态。
 * 供 Runtime/Surface boundary 做 loading 门控；业务组件不应各自写 `if (!hydrated)`。
 *
 * 注意：本文件属于 @community-go/state-foundation/react subpath；
 * 纯 store/storage 消费者不应 import 它。
 */
import { useSyncExternalStore } from 'react';

import type { StoreApi } from 'zustand/vanilla';

import { createHydrationLifecycle, getHydrationLifecycle } from '../hydration/lifecycle';

export function useHydratedStore<S>(store: StoreApi<S>): boolean {
  const lifecycle =
    getHydrationLifecycle(store) ??
    // 惰性创建并触发（幂等；Strict Mode 双调用安全）
    (() => {
      const created = createHydrationLifecycle(store);
      created.trigger();
      return created;
    })();

  return useSyncExternalStore(
    (onStoreChange) => lifecycle.subscribe(onStoreChange),
    () => lifecycle.status === 'hydrated',
    () => false, // SSR 初始视为未 hydrated（避免 hydration mismatch）
  );
}

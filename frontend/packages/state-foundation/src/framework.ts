/**
 * Store Factory —— 薄封装 zustand，统一项目 Store 创建约定。
 *
 * 开发者仍看得出底层是 zustand：返回的就是 UseBoundStore（含 .persist 等原生 API）。
 * createAppStore：普通 non-persist store。
 * createPersistStore：组合 zustand create + persist + definePersistConfig + 默认 storage。
 *
 * PersistedState 类型在 JSON 层运行时无意义；类型安全由 config.partialize/migrate 的
 * 泛型约束承担，store 返回类型保持 S（persist 后的完整 state）。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StateCreator, StoreApi } from 'zustand/vanilla';
import type { UseBoundStore } from 'zustand/react';
import { useStore } from 'zustand/react';

import type { PersistConfig } from './contract/persist';
import { definePersistConfig } from './persist/config';
import { getHydrationLifecycle } from './hydration/lifecycle';

/** 创建普通（不持久化）store。 */
export function createAppStore<S>(
  initializer: StateCreator<S, [], []>,
): UseBoundStore<StoreApi<S>> {
  return create<S>(initializer);
}

type PersistStoreApi<S> = StoreApi<S> & {
  persist: {
    setOptions(options: unknown): void;
    clearStorage(): void;
    rehydrate(): Promise<void> | void;
    hasHydrated(): boolean;
    getOptions(): unknown;
  };
};

/**
 * 创建持久化 store：显式 PersistConfig（persistence 是 opt-in）。
 * 返回类型带 .persist（clearStorage/rehydrate/hasHydrated 等原生 API）。
 * 自动注入 onRehydrateStorage：hydration 失败时报告给 store 的 hydration lifecycle。
 *
 * P = PersistedState（partialize 后的子集类型）；缺省 Partial<S>。
 * JSON 层运行时无类型，P 只用于 config 的类型约束。
 */
export function createPersistStore<S, P = Partial<S>>(
  initializer: StateCreator<S, [['zustand/persist', unknown]]>,
  config: PersistConfig<S, P>,
): UseBoundStore<PersistStoreApi<S>> {
  const userOnRehydrate = config.onRehydrateStorage;
  const effectiveConfig: PersistConfig<S, P> = {
    ...config,
    onRehydrateStorage:
      userOnRehydrate === undefined
        ? () => (_nextState, error) => {
            if (error) getHydrationLifecycle(store)?.reportError(error);
          }
        : (state) => {
            const userPost = userOnRehydrate(state);
            return (nextState, error) => {
              if (error) getHydrationLifecycle(store)?.reportError(error);
              userPost?.(nextState, error);
            };
          },
  };
  const persistOptions = definePersistConfig<S, P>(effectiveConfig);
  const store = create<S>()(persist(initializer, persistOptions));
  return store;
}

/** 读取 store 的 hook 绑定（供非 hook 上下文/测试）。 */
export { useStore };

/**
 * Hydration Lifecycle —— store-scoped hydration 状态机。
 *
 * 正确处理：尚未 hydrate / 进行中 / 完成 / 失败；多 consumer 同时 mount；
 * 已 hydrated 后新 consumer；async storage；repeated rehydrate；Strict Mode。
 *
 * 错误检测：zustand persist 的 rehydrate() 内部吞错（永不 reject），因此 lifecycle
 * 通过 createPersistStore 注入的 onRehydrateStorage 回调感知失败（reportError）；
 * 完成感知用 zustand 的 onFinishHydration。
 */
import type { StoreApi } from 'zustand/vanilla';

export type HydrationStatus = 'idle' | 'hydrating' | 'hydrated' | 'error';

export interface HydrationLifecycle {
  /** 当前状态。 */
  status: HydrationStatus;
  /** 幂等触发 hydration；返回本次是否真正发起。 */
  trigger(): boolean;
  /** 外部（注入的 onRehydrateStorage）报告 hydration 失败。 */
  reportError(error: unknown): void;
  /** 订阅状态变化；返回取消函数。 */
  subscribe(listener: (status: HydrationStatus) => void): () => void;
  /** 命令式重置（测试用）。 */
  reset(): void;
}

type PersistedStoreApi<S> = StoreApi<S> & {
  persist?: {
    rehydrate: () => Promise<void> | void;
    hasHydrated: () => boolean;
    onFinishHydration?: (fn: (state: S) => void) => () => void;
  };
};

const lifecycleRegistry = new WeakMap<object, HydrationLifecycle>();

export function getHydrationLifecycle<S>(store: StoreApi<S>): HydrationLifecycle | null {
  return lifecycleRegistry.get(store) ?? null;
}

/** 为 store 创建/获取 hydration lifecycle。store 必须启用 persist（含 skipHydration 手动模式）。 */
export function createHydrationLifecycle<S>(store: StoreApi<S>): HydrationLifecycle {
  const existing = lifecycleRegistry.get(store);
  if (existing) return existing;

  const api = store as PersistedStoreApi<S>;
  if (!api.persist) {
    throw new Error('Hydration lifecycle: store 未启用 persist middleware');
  }

  let status: HydrationStatus = api.persist.hasHydrated() ? 'hydrated' : 'idle';
  let inFlight = false;
  let failed: unknown = null;
  const listeners = new Set<(s: HydrationStatus) => void>();

  const setStatus = (next: HydrationStatus) => {
    if (status === next) return;
    status = next;
    for (const fn of listeners) fn(status);
  };

  const finish = () => {
    if (!inFlight) return;
    inFlight = false;
    setStatus(failed === null ? 'hydrated' : 'error');
  };

  const lifecycle: HydrationLifecycle = {
    get status() {
      return status;
    },
    trigger() {
      if (status === 'hydrated') return false;
      // 已失败（parse/migrate 错误）不自动重试：避免 StrictMode 重挂载等再次触发读到
      // 被回写的记录而把失败清成成功；恢复动作由呈现层显式提供（reset 后可重试）。
      if (status === 'error') return false;
      if (inFlight) return false;
      // 已经 hydrate 过（非首次 mount 的新 consumer）直接完成
      if (api.persist!.hasHydrated()) {
        setStatus('hydrated');
        return false;
      }
      inFlight = true;
      failed = null;
      setStatus('hydrating');

      // 完成感知：zustand persist 在 hydrate 结束后触发 onFinishHydration。
      const unsub = api.persist!.onFinishHydration?.(() => {
        unsub?.();
        finish();
      });
      try {
        const result = api.persist!.rehydrate();
        if (result && typeof result.then === 'function') {
          // async storage：等待 onFinishHydration（zustand 内部 catch，不 reject）。
          void result.catch(() => {
            // zustand 已吞错；错误经 reportError 到达。这里仅兜底 finish。
          });
        } else {
          // sync storage：rehydrate 同步完成；onFinishHydration 已同步/微任务触发。
          // 若 onFinishHydration 不可用（无该方法），用微任务兜底。
          if (!api.persist!.onFinishHydration) queueMicrotask(finish);
        }
      } catch (error) {
        failed = error;
        finish();
      }
      return true;
    },
    reportError(error: unknown) {
      failed = error;
      if (status === 'hydrating') finish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      inFlight = false;
      failed = null;
      setStatus(api.persist!.hasHydrated() ? 'hydrated' : 'idle');
    },
  };

  lifecycleRegistry.set(store, lifecycle);
  return lifecycle;
}

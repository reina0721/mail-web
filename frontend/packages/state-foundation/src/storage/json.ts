/**
 * JSON Layer —— 复用 zustand createJSONStorage（JSON.stringify/parse）。
 *
 * **SSR-safe**：zustand createJSONStorage 创建时会立即调用一次 getStorage()，
 * 因此 getStorage 必须永不抛错——这里返回惰性 wrapper（不访问 window），
 * 真正的浏览器访问延迟到首次 getItem/setItem（persist hydrate/写入时）。
 * 环境非法（无 window/隐私模式）时按 unavailablePolicy 给出明确行为
 * （默认 error：执行时报错，不静默降级 memory，防 Server memory + Client
 * localStorage 双事实源）。
 */
import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';

import type { UnavailablePolicy, WebStorageKind } from './types';

/**
 * 创建永不抛错的惰性 StateStorage：方法首次调用时才 resolve 浏览器 storage。
 * resolve 失败（SSR/无 window/隐私模式）时按 policy 处理（error 抛 / noop 空实现）。
 */
function createLazyWebStorage(kind: WebStorageKind, policy: UnavailablePolicy): StateStorage {
  let cached: StateStorage | null = null;
  const resolve = (): StateStorage => {
    if (cached) return cached;
    if (typeof window !== 'undefined' && window[kind]) {
      const store = window[kind];
      cached = {
        getItem: (name) => store.getItem(name),
        setItem: (name, value) => {
          store.setItem(name, value);
          return undefined;
        },
        removeItem: (name) => {
          store.removeItem(name);
          return undefined;
        },
      };
      return cached;
    }
    if (policy === 'noop') {
      cached = {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      };
      return cached;
    }
    // policy === 'error'：创建不抛（SSR-safe）；首次真实操作时抛明确错误。
    throw new Error(
      `Storage unavailable: ${kind} 在非法环境（SSR/无 window）不可用；请显式配置 unavailablePolicy 或使用 memory storage`,
    );
  };
  return {
    getItem: (name) => resolve().getItem(name),
    setItem: (name, value) => resolve().setItem(name, value),
    removeItem: (name) => resolve().removeItem(name),
  };
}

/** 创建 JSON PersistStorage（惰性 Web Storage + JSON 序列化）。SSR-safe：创建不访问 window。 */
export function createJsonStorage<S = unknown>(
  kind: WebStorageKind,
  options?: Readonly<{ unavailablePolicy?: UnavailablePolicy }>,
): PersistStorage<S> {
  const policy = options?.unavailablePolicy ?? 'error';
  // getStorage 永不抛（SSR-safe）；浏览器访问延迟到首次 getItem/setItem。
  const storage = createJSONStorage<S>(() => createLazyWebStorage(kind, policy));
  if (!storage) {
    // createJSONStorage 仅在 getStorage 抛错时返回 undefined；此处不会发生（lazy wrapper 不抛）。
    throw new Error(`Storage unavailable: ${kind} createJSONStorage 初始化失败`);
  }
  return storage;
}

/**
 * store-harness —— 测试隔离辅助。
 * 提供：隔离 namespace（随机后缀）、memory storage 注入、migrate 夹具、测试间重置。
 */
import { createJSONStorage, type PersistStorage } from 'zustand/middleware';

import { createMemoryBackend } from '../storage/memory';
import { createNamespace } from '../persist/namespace';

/** 生成隔离 namespace（避免测试间 key 冲突）。 */
export function createIsolatedNamespace(store: string, scope = 'test') {
  const suffix = Math.random().toString(36).slice(2, 8);
  return createNamespace(`${store}-${suffix}`, { scope });
}

/** 创建带可重置 memory backend 的 storage + 后端句柄。 */
export function createHarnessStorage<S = unknown>(
  initial?: Readonly<Record<string, string>>,
): {
  storage: PersistStorage<S>;
  backend: ReturnType<typeof createMemoryBackend>;
} {
  const backend = createMemoryBackend(initial);
  const storage = createJSONStorage<S>(() => backend);
  if (!storage) throw new Error('Store harness: createJSONStorage 初始化失败');
  return { storage, backend };
}

/** 构造一段旧版本存储值（migrate 夹具）。 */
export function createPersistedFixture(state: unknown, version: number): string {
  return JSON.stringify({ state, version });
}

export interface StoreHarness {
  storage: PersistStorage<unknown>;
  backend: ReturnType<typeof createMemoryBackend>;
  namespace: ReturnType<typeof createIsolatedNamespace>;
  key: string;
  reset(): void;
}

/** 组装一个完整 harness（namespace + storage + key + reset）。 */
export function createStoreHarness(storeName: string): StoreHarness {
  const namespace = createIsolatedNamespace(storeName);
  const { storage, backend } = createHarnessStorage();
  const key = `${namespace.product}.${namespace.scope}.${namespace.store}`;
  return {
    storage,
    backend,
    namespace,
    key,
    reset: () => backend.reset(),
  };
}

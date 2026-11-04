/**
 * IndexedDB Adapter —— durable async storage（补齐 zustand 未内置的异步持久层）。
 *
 * 后端为 async string KV（Promise get/set/remove），适配成 async StateStorage，
 * 再经 zustand createJSONStorage 成 PersistStorage——不隐藏异步事实。
 * **SSR-safe**：创建 adapter 不访问 indexedDB；首次 get/set 才 resolve。
 * 环境缺 indexedDB 时按 unavailablePolicy 明确处理（默认 error，不静默降级）。
 */
import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';

import type { AsyncKeyValueStorage, UnavailablePolicy } from './types';

/** 最小 IndexedDB KV：单库单 store，值存 JSON string。 */
export function createIndexedDBBackend(
  databaseName: string,
  storeName = 'kv',
): AsyncKeyValueStorage & { close(): void } {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
    return dbPromise;
  };

  const withStore = <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          const req = operation(tx.objectStore(storeName));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error('IndexedDB operation failed'));
        }),
    );

  return {
    getItem: (name) =>
      withStore<string | undefined>(
        'readonly',
        (s) => s.get(name) as IDBRequest<string | undefined>,
      ).then((v) => v ?? null),
    setItem: (name, value) =>
      withStore('readwrite', (s) => s.put(value, name)).then(() => undefined),
    removeItem: (name) => withStore('readwrite', (s) => s.delete(name)).then(() => undefined),
    close: () => {
      void open().then((db) => db.close());
    },
  };
}

/** 创建 JSON PersistStorage（IndexedDB 后端 + JSON；async roundtrip）。SSR-safe lazy。 */
export function createIndexedDBStorage<S = unknown>(options?: {
  databaseName?: string;
  storeName?: string;
  unavailablePolicy?: UnavailablePolicy;
}): PersistStorage<S> {
  const policy = options?.unavailablePolicy ?? 'error';
  const databaseName = options?.databaseName ?? 'community-go';
  const storeName = options?.storeName ?? 'kv';

  let backend: AsyncKeyValueStorage | null = null;
  const resolveBackend = (): AsyncKeyValueStorage => {
    if (backend) return backend;
    if (typeof indexedDB === 'undefined') {
      if (policy === 'noop') {
        backend = {
          getItem: () => Promise.resolve(null),
          setItem: () => Promise.resolve(undefined),
          removeItem: () => Promise.resolve(undefined),
        };
        return backend;
      }
      throw new Error('IndexedDB unavailable: 当前环境无 indexedDB（policy=error）');
    }
    backend = createIndexedDBBackend(databaseName, storeName);
    return backend;
  };

  // async string StateStorage（lazy resolve backend）→ createJSONStorage 成 PersistStorage。
  const raw: StateStorage = {
    getItem: async (name) => {
      const b = resolveBackend();
      return await b.getItem(name);
    },
    setItem: async (name, value) => {
      const b = resolveBackend();
      await b.setItem(name, value);
      return undefined;
    },
    removeItem: async (name) => {
      const b = resolveBackend();
      await b.removeItem(name);
      return undefined;
    },
  };
  const storage = createJSONStorage<S>(() => raw);
  if (!storage) throw new Error('IndexedDB storage: createJSONStorage 初始化失败');
  return storage;
}

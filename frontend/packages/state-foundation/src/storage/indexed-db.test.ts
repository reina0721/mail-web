import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createIndexedDBBackend, createIndexedDBStorage } from './indexed-db';

/* ---- 最小 fake IndexedDB（自包含，避免引入 fake-indexeddb 依赖）---- */
function installFakeIndexedDB() {
  const dbs = new Map<string, FakeDB>();
  const fake = {
    open: (name: string) => {
      const request = {
        result: undefined as unknown,
        onupgradeneeded: null as ((ev: unknown) => void) | null,
        onsuccess: null as ((ev: unknown) => void) | null,
        onerror: null as ((ev: unknown) => void) | null,
        error: null as Error | null,
      };
      queueMicrotask(() => {
        let db = dbs.get(name);
        const isNew = !db;
        if (!db) {
          db = new FakeDB();
          dbs.set(name, db);
        }
        request.result = db;
        if (isNew) request.onupgradeneeded?.(null);
        request.onsuccess?.(null);
      });
      return request;
    },
  };
  (globalThis as Record<string, unknown>).indexedDB = fake;
  return fake;
}
type FakeRequest = {
  result: unknown;
  onsuccess: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
class FakeObjectStore {
  private map = new Map<string, unknown>();
  get(key: string): FakeRequest {
    const req: FakeRequest = { result: this.map.get(key), onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess?.(null));
    return req;
  }
  put(value: unknown, key: string): FakeRequest {
    this.map.set(key, value);
    const req: FakeRequest = { result: undefined, onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess?.(null));
    return req;
  }
  delete(key: string): FakeRequest {
    this.map.delete(key);
    const req: FakeRequest = { result: undefined, onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess?.(null));
    return req;
  }
}
class FakeDB {
  stores = new Map<string, FakeObjectStore>();
  createObjectStore(name: string) {
    const s = new FakeObjectStore();
    this.stores.set(name, s);
    return s;
  }
  transaction = () => {
    return {
      objectStore: (name: string) => {
        let s = this.stores.get(name);
        if (!s) {
          s = new FakeObjectStore();
          this.stores.set(name, s);
        }
        return s;
      },
    };
  };
  objectStoreNames = { contains: () => false };
  close() {
    /* noop */
  }
}

type Payload = { theme: 'light' | 'dark' };

describe('indexedDB storage adapter (fake idb)', () => {
  beforeEach(() => {
    installFakeIndexedDB();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).indexedDB;
  });

  it('async backend roundtrip（raw string KV）', async () => {
    const backend = createIndexedDBBackend('test-db');
    await backend.setItem('k', JSON.stringify({ state: { theme: 'dark' }, version: 1 }));
    expect(await backend.getItem('k')).toContain('"theme":"dark"');
    await backend.removeItem('k');
    expect(await backend.getItem('k')).toBeNull();
    backend.close();
  });

  it('PersistStorage 形态 async roundtrip（StorageValue JSON）', async () => {
    const storage = createIndexedDBStorage<Payload>({ databaseName: 'test-db2' });
    await storage.setItem('community-go.shell', { state: { theme: 'light' }, version: 1 });
    expect(await storage.getItem('community-go.shell')).toEqual({
      state: { theme: 'light' },
      version: 1,
    });
    await storage.removeItem('community-go.shell');
    expect(await storage.getItem('community-go.shell')).toBeNull();
  });

  it('unavailablePolicy=noop 在无 idb 时不崩（async noop）', async () => {
    delete (globalThis as Record<string, unknown>).indexedDB;
    const storage = createIndexedDBStorage<Payload>({ unavailablePolicy: 'noop' });
    await storage.setItem('k', { state: { theme: 'dark' }, version: 1 });
    expect(await storage.getItem('k')).toBeNull();
  });

  it('默认 policy=error 在无 idb 时首次操作抛错（创建 SSR-safe）', async () => {
    delete (globalThis as Record<string, unknown>).indexedDB;
    const storage = createIndexedDBStorage<Payload>(); // 创建不抛（lazy）
    await expect(storage.getItem('k')).rejects.toThrow(/IndexedDB unavailable/);
  });
});

/**
 * async-storage fixture —— 模拟 async hydration / error 的测试后端。
 * 后端为 async string KV（延迟 resolve + 可注入失败），经 createJSONStorage 成 PersistStorage。
 */
import { createJSONStorage, type PersistStorage } from 'zustand/middleware';

export interface AsyncStorageFixture {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
  /** 强制下次 getItem reject（测 hydration error）。 */
  failNextGet(): void;
  /** 已写入的条目。 */
  written: Map<string, string>;
  /** 重置并清空。 */
  reset(): void;
}

/** 创建 async PersistStorage fixture。 */
export function createAsyncStorageFixture<S = unknown>(options?: {
  delayMs?: number;
  initial?: Readonly<Record<string, string>>;
}): PersistStorage<S> & { fixture: AsyncStorageFixture } {
  const delayMs = options?.delayMs ?? 5;
  const written = new Map<string, string>(options?.initial ? Object.entries(options.initial) : []);
  let failNext = false;

  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

  const fixture: AsyncStorageFixture = {
    getItem: async (name) => {
      await delay();
      if (failNext) {
        failNext = false;
        throw new Error('AsyncStorageFixture: simulated read failure');
      }
      return written.get(name) ?? null;
    },
    setItem: async (name, value) => {
      await delay();
      written.set(name, value);
    },
    removeItem: async (name) => {
      await delay();
      written.delete(name);
    },
    failNextGet: () => {
      failNext = true;
    },
    written,
    reset: () => written.clear(),
  };

  const storage = createJSONStorage<S>(() => ({
    getItem: (name) => fixture.getItem(name),
    setItem: (name, value) => fixture.setItem(name, value),
    removeItem: (name) => fixture.removeItem(name),
  }));
  if (!storage) throw new Error('Async storage fixture: createJSONStorage 初始化失败');
  return Object.assign(storage, { fixture });
}

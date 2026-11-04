/**
 * memory Storage —— 测试 / SSR-safe fixture / preview。
 * Sync Map 后端（string 级 StateStorage）+ zustand createJSONStorage 成 PersistStorage。
 */
import { createJSONStorage, type PersistStorage } from 'zustand/middleware';

/** 内存后端（string 级 KV + 测试辅助）。 */
export interface MemoryBackend {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
  reset(): void;
  entries(): ReadonlyArray<readonly [string, string]>;
  keys(): readonly string[];
}

export function createMemoryBackend(initial?: Readonly<Record<string, string>>): MemoryBackend {
  const map = new Map<string, string>(initial ? Object.entries(initial) : []);
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
    reset: () => map.clear(),
    entries: () => [...map.entries()],
    keys: () => [...map.keys()],
  };
}

/** 创建 JSON PersistStorage（内存后端 + JSON），供测试 / SSR fixture。 */
export function createMemoryStorage<S = unknown>(
  initial?: Readonly<Record<string, string>>,
): PersistStorage<S> & { backend: MemoryBackend } {
  const backend = createMemoryBackend(initial);
  const storage = createJSONStorage<S>(() => ({
    getItem: (name) => backend.getItem(name),
    setItem: (name, value) => {
      backend.setItem(name, value);
      return undefined;
    },
    removeItem: (name) => {
      backend.removeItem(name);
      return undefined;
    },
  }));
  if (!storage) throw new Error('Memory storage: createJSONStorage 初始化失败');
  return Object.assign(storage, { backend });
}

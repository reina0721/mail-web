/**
 * Storage 类型 —— 复用 zustand 的 StateStorage/PersistStorage 语义，
 * 避免第二套 storage 抽象。
 */
import type { PersistStorage, StateStorage } from 'zustand/middleware';

export type { PersistStorage, StateStorage };

/** storage 在后端不可用时的明确行为（默认 error：不静默换 backend）。 */
export type UnavailablePolicy = 'error' | 'noop' | 'memory';

/** 浏览器 Web Storage 名称。 */
export type WebStorageKind = 'localStorage' | 'sessionStorage';

/** Raw storage 工厂需要 SSR-safe：创建时不访问 window，执行时才 resolve。 */
export type WebStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 统一的 raw async KV（IndexedDB 等）。 */
export interface AsyncKeyValueStorage {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
}

/** 把 raw string storage 转成 zustand StateStorage（JSON 由 createJsonStorage 层处理）。 */
export function toStateStorage(raw: WebStorageLike | AsyncKeyValueStorage): StateStorage {
  return {
    getItem: (name) => raw.getItem(name),
    setItem: (name, value) => raw.setItem(name, value),
    removeItem: (name) => raw.removeItem(name),
  };
}

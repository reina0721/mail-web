/**
 * @community-go/state-foundation —— 产品状态管理（Application State Mechanics）。
 *
 * 提供：Store 创建约定（createAppStore/createPersistStore）、Persistence Contract、
 * Storage Adapter（local/session/memory/IndexedDB）、Namespace、Hydration lifecycle。
 *
 * 不负责：Store Registry/Catalog、Plugin Store discovery、Server State、UI State
 * Presentation（StateSurface/AsyncRegion/productStates 属 surface-foundation）。
 *
 * React hydration hook 在 @community-go/state-foundation/react；
 * 测试工具在 @community-go/state-foundation/testing（production 禁止 import）。
 */
export { defineStoreContract } from './contract/store';
export type { StoreContract, StorePersistence, StoreScope } from './contract/store';
export { formatPersistKey, PERSIST_POLICY } from './contract/persist';
export type { PersistConfig, PersistNamespace } from './contract/persist';

export { definePersistConfig } from './persist/config';
export {
  createNamespace,
  createPersistKey,
  isManagedKey,
  namespaceKey,
  DEFAULT_PRODUCT,
} from './persist/namespace';

export {
  createJsonStorage,
  createLocalStorage,
  createSessionStorage,
  createMemoryBackend,
  createMemoryStorage,
  createIndexedDBBackend,
  createIndexedDBStorage,
  toStateStorage,
} from './storage';
export type {
  AsyncKeyValueStorage,
  MemoryBackend,
  PersistStorage,
  StateStorage,
  UnavailablePolicy,
  WebStorageKind,
} from './storage';

export { createHydrationLifecycle, getHydrationLifecycle } from './hydration/lifecycle';
export type { HydrationLifecycle, HydrationStatus } from './hydration/lifecycle';
export { rehydrateStore, isStoreHydrated } from './hydration/rehydrate';

export { createAppStore, createPersistStore } from './framework';

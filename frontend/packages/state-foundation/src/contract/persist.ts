/**
 * Persistence Contract 类型 —— 统一 PersistConfig 的形状。
 *
 * 只定义类型与 namespace 工具，不实现第二套 persist engine；
 * 运行时能力复用 zustand persist（见 persist/config.ts 的 definePersistConfig）。
 */
import type { PersistStorage } from 'zustand/middleware';

/** 持久化 key 的稳定命名空间。默认策略：`community-go.<scope>.<store>`。 */
export type PersistNamespace = Readonly<{
  product: string;
  scope: string;
  store: string;
}>;

/** 构造稳定 storage key；兼容历史 key（如 community-go.shell）。 */
export function formatPersistKey(namespace: PersistNamespace): string {
  const { product, scope, store } = namespace;
  const parts = [product, scope, store].filter(Boolean);
  if (parts.length === 0) throw new Error('Persist namespace: 至少需要 product 或 store 一段');
  return parts.join('.');
}

/** PersistConfig 的 product 形状（由 definePersistConfig 消费，映射到 zustand persist options）。 */
export type PersistConfig<S, PersistedState = Partial<S>> = Readonly<{
  /** 持久化 storage key（namespace 展开后的完整 key）。 */
  name: string;
  /** 数据版本；与存储值 version 不符时触发 migrate。 */
  version: number;
  /** 从旧版本迁移存储值（含未来版本的回滚/重建语义）。 */
  migrate?: (persistedState: unknown, version: number) => PersistedState | Promise<PersistedState>;
  /** 白名单：只持久化这些字段（显式 opt-in，禁止黑名单思维）。 */
  partialize?: (state: S) => PersistedState;
  /** 自定义合并策略（默认浅合并）。 */
  merge?: (persistedState: unknown, currentState: S) => S;
  /** true 时持久化中间件不自动 hydration，由 rehydrateStore 显式触发（SSR 场景）。 */
  skipHydration?: boolean;
  /** hydration 生命周期回调（zustand 透传）；state-foundation 用它感知失败并驱动 lifecycle。 */
  onRehydrateStorage?: (state: S) => ((state?: S, error?: unknown) => void) | void;
  /** 存储后端（默认 createLocalStorage）。JSON 层运行时无类型；persisted 类型由调用方对齐。 */
  storage?: PersistStorage<PersistedState>;
  /** 命名空间 metadata（用于文档/testing；key 以 name 为准）。 */
  namespace?: PersistNamespace;
}>;

/** Persistence Policy 声明：明确"适合/不适合持久化"的类型提示（供文档与 review）。 */
export const PERSIST_POLICY = {
  durable: [
    'explicit user preference',
    'durable UI configuration',
    'visible columns',
    'density',
    'page size preference',
    'sidebar preference',
    'recoverable draft',
    'resumable client workflow',
  ] as const,
  transient: [
    'loading',
    'error',
    'request promise',
    'transient dialog open',
    'hover',
    'focus',
    'temporary animation state',
    'raw API response',
    'auth secret',
    'permission snapshot',
    'unstable runtime object',
  ] as const,
} as const;

/**
 * sessionStorage Adapter —— current-tab session 状态。
 * SSR-safe（lazy resolve）。
 */
import type { PersistStorage } from 'zustand/middleware';

import { createJsonStorage } from './json';
import type { UnavailablePolicy } from './types';

export function createSessionStorage<S = unknown>(options?: {
  unavailablePolicy?: UnavailablePolicy;
}): PersistStorage<S> {
  return createJsonStorage<S>('sessionStorage', options);
}

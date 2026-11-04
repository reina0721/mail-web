/**
 * localStorage Adapter —— durable client preference。
 * SSR-safe（lazy resolve）；unavailable 策略默认 error，不静默降级。
 */
import type { PersistStorage } from 'zustand/middleware';

import { createJsonStorage } from './json';
import type { UnavailablePolicy } from './types';

export function createLocalStorage<S = unknown>(options?: {
  unavailablePolicy?: UnavailablePolicy;
}): PersistStorage<S> {
  return createJsonStorage<S>('localStorage', options);
}

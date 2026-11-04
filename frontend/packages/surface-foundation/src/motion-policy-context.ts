'use client';

import { createContext, useContext } from 'react';

export type MotionMode = 'system' | 'full' | 'reduced' | 'off';
export type MotionScale = 1 | 2 | 4;
export type MotionCategory = 'screen' | 'async' | 'reveal' | 'swap' | 'feedback' | 'media';
export type MotionCategoryState = Readonly<Record<MotionCategory, boolean>>;
export type MotionPolicyState = Readonly<{
  mode: MotionMode;
  scale: MotionScale;
  categories: MotionCategoryState;
}>;
export type MotionPolicyController = MotionPolicyState &
  Readonly<{
    resolvedMode: 'full' | 'reduced' | 'off';
    inspectorAvailable: boolean;
    setMode: (mode: MotionMode) => void;
    setScale: (scale: MotionScale) => void;
    setCategories: (categories: MotionCategoryState) => void;
  }>;

export const MotionPolicyContext = createContext<MotionPolicyController | null>(null);

export function useMotionPolicy() {
  const policy = useContext(MotionPolicyContext);
  if (!policy) throw new Error('useMotionPolicy 必须在 MotionPolicyProvider 内使用');
  return policy;
}

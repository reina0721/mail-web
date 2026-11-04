import { createContext, useContext } from 'react';

import type { FeedbackTone } from './feedback';

export type FeedbackAction = Readonly<{
  label: string;
  onPress: () => void;
}>;

export type FeedbackMessage = Readonly<{
  title: string;
  description?: string;
  tone?: FeedbackTone;
  action?: FeedbackAction;
  duration?: 'transient' | 'persistent';
  loading?: boolean;
}>;

export type FeedbackController = Readonly<{
  notify: (message: FeedbackMessage) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}>;

export const FeedbackContext = createContext<FeedbackController | null>(null);

export function useFeedback() {
  const controller = useContext(FeedbackContext);
  if (!controller) throw new Error('useFeedback 必须在 FeedbackProvider 内使用');
  return controller;
}

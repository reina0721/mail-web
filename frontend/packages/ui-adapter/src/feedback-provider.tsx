import { ToastQueue, type ToastContentValue } from '@heroui/react/toast';
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';

import { FeedbackContext, type FeedbackController } from './feedback-context';
import type { FeedbackTone } from './feedback';
import { BusyIndicator } from './busy-indicator';
const FeedbackToastRegion = lazy(() =>
  import('./feedback-toast-region').then((module) => ({ default: module.FeedbackToastRegion })),
);

const toneVariant: Record<FeedbackTone, ToastContentValue['variant']> = {
  danger: 'danger',
  info: 'accent',
  neutral: 'default',
  success: 'success',
  warning: 'warning',
};

export type FeedbackProviderProps = Readonly<{
  children: ReactNode;
  closeLabel: string;
  loadingLabel: string;
  /**
   * 非关键成功提示时长（ms）。Host 经展示策略传入（settings 通知 → 提示时长
   * short/standard/long → 3/5/8s）；persistent/loading toast 不受影响。缺省 5000ms。
   */
  toastDurationMs?: number;
}>;

export function FeedbackProvider({
  children,
  closeLabel,
  loadingLabel,
  toastDurationMs = 5_000,
}: FeedbackProviderProps) {
  const [queue] = useState(() => new ToastQueue<ToastContentValue>({ maxVisibleToasts: 3 }));
  const [requested, setRequested] = useState(false);
  const controller = useMemo<FeedbackController>(
    () => ({
      clear: () => queue.clear(),
      dismiss: (id) => queue.close(id),
      notify: ({
        title,
        description,
        tone = 'neutral',
        action,
        duration = 'transient',
        loading = false,
      }) => {
        setRequested(true);
        return queue.add(
          {
            title,
            variant: toneVariant[tone],
            ...(description ? { description } : {}),
            ...(action
              ? {
                  actionProps: {
                    children: action.label,
                    onPress: action.onPress,
                    variant: 'ghost',
                  },
                }
              : {}),
            ...(loading ? { isLoading: true } : {}),
          },
          { timeout: loading || duration === 'persistent' ? 0 : toastDurationMs },
        );
      },
    }),
    [queue, toastDurationMs],
  );

  return (
    <FeedbackContext value={controller}>
      {children}
      {requested ? (
        <Suspense
          fallback={
            <div className="pointer-events-none fixed bottom-6 right-6 z-toast">
              <BusyIndicator label={loadingLabel} />
            </div>
          }
        >
          <FeedbackToastRegion queue={queue} closeLabel={closeLabel} />
        </Suspense>
      ) : null}
    </FeedbackContext>
  );
}

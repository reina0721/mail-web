import { ProgressMeter } from '@community-go/ui-adapter/progress-meter';
import { Skeleton } from '@community-go/ui-adapter/skeleton';
import { StateSurface } from '@community-go/ui-adapter/state-surface';
import type { ReactNode } from 'react';

export type OperationState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ViewState =
  | 'ready'
  | 'loading'
  | 'refreshing'
  | 'background'
  | 'empty'
  | 'error'
  | 'partial'
  | 'readonly'
  | 'denied'
  | 'pending';

/** StateRegion 统一页面/Region 状态替换；数据请求、权限和任务计算仍由 Feature 提供。 */
export function StateRegion({
  state,
  label,
  content,
  loading,
  empty,
  error,
  refreshing,
  partialNotice,
  readonlyNotice,
  denied,
  pending,
}: Readonly<{
  state: ViewState;
  label: string;
  content: ReactNode;
  loading: ReactNode;
  empty: ReactNode;
  error: ReactNode;
  refreshing: ReactNode;
  partialNotice: ReactNode;
  readonlyNotice: ReactNode;
  denied: ReactNode;
  pending: ReactNode;
}>) {
  const replacement =
    state === 'loading'
      ? loading
      : state === 'empty'
        ? empty
        : state === 'error'
          ? error
          : state === 'denied'
            ? denied
            : state === 'pending'
              ? pending
              : null;

  const contentAvailable =
    state === 'ready' ||
    state === 'refreshing' ||
    state === 'background' ||
    state === 'partial' ||
    state === 'readonly';

  return (
    <section
      aria-busy={state === 'loading' || state === 'refreshing' || undefined}
      aria-label={label}
      className="surface-state-region"
      data-motion-recipe="async"
      data-state={state}
    >
      {state === 'refreshing' ? refreshing : null}
      {replacement ?? (
        <div className="surface-state-region-content grid gap-4" hidden={!contentAvailable}>
          {state === 'partial' ? partialNotice : null}
          {state === 'readonly' ? readonlyNotice : null}
          {content}
        </div>
      )}
    </section>
  );
}

export type PageLoadingKind = 'page' | 'catalog' | 'collection' | 'form';

/** PageLoadingSurface 为路由与 Suspense 提供保持产品信息层级的结构化占位。 */
export function PageLoadingSurface({
  label,
  kind = 'page',
}: Readonly<{ label: string; kind?: PageLoadingKind }>) {
  const rows = kind === 'collection' ? 7 : kind === 'form' ? 4 : 3;
  return (
    <section
      aria-busy="true"
      aria-label={label}
      className="surface-page-stack"
      data-loading-kind={kind}
      role="status"
    >
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className={kind === 'catalog' ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'}>
        {Array.from({ length: rows }, (_, index) => (
          <div className="rounded-panel border border-border bg-surface p-5" key={index}>
            <div className="space-y-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className={kind === 'form' ? 'h-10 w-full' : 'h-16 w-full'} />
              {kind === 'collection' ? <Skeleton className="h-10 w-full" /> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OperationStatus({
  state,
  title,
  description,
  icon,
  progress,
  progressLabel,
  actions,
}: Readonly<{
  state: OperationState;
  title: string;
  description: string;
  icon: ReactNode;
  progress?: number;
  progressLabel?: string;
  actions?: ReactNode;
}>) {
  const surfaceState =
    state === 'failed'
      ? 'error'
      : state === 'succeeded'
        ? 'success'
        : state === 'cancelled'
          ? 'warning'
          : 'pending';
  return (
    <div className="space-y-4">
      <StateSurface state={surfaceState} title={title} description={description} icon={icon} />
      {progress !== undefined && progressLabel ? (
        <ProgressMeter value={progress} label={progressLabel} />
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

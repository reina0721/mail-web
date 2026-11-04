import type { ProductState } from '@community-go/types';
import type { ReactNode } from 'react';

import { Action } from './action';

type OptionalRecoveryAction =
  | Readonly<{ actionLabel: string; onAction: () => void }>
  | Readonly<{ actionLabel?: never; onAction?: never }>;

const stateTone: Record<ProductState, string> = {
  loading: 'bg-info-soft text-info',
  empty: 'bg-surface-muted text-ink-muted',
  error: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  disabled: 'bg-surface-muted text-ink-muted',
  pending: 'bg-info-soft text-info',
  offline: 'bg-warning-soft text-warning',
  'permission-denied': 'bg-danger-soft text-danger',
};

export type StateSurfaceProps = Readonly<
  {
    state: ProductState;
    icon: ReactNode;
    title: string;
    description: string;
    compact?: boolean;
    announcement?: 'none' | 'polite' | 'urgent';
  } & OptionalRecoveryAction
>;

export function StateSurface({
  state,
  icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  announcement = 'none',
}: StateSurfaceProps) {
  return (
    <div
      className={`grid place-items-center text-center ${compact ? 'min-h-56 p-5' : 'min-h-80 p-8'}`}
      {...(announcement === 'urgent'
        ? { role: 'alert' as const }
        : announcement === 'polite'
          ? { role: 'status' as const }
          : {})}
    >
      <span className={`grid size-12 place-items-center rounded-panel ${stateTone[state]}`}>
        {icon}
      </span>
      <div className="mt-4 max-w-sm">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
      </div>
      {actionLabel !== undefined ? (
        <div className="mt-5">
          <Action variant="secondary" size="sm" onPress={onAction}>
            {actionLabel}
          </Action>
        </div>
      ) : null}
    </div>
  );
}

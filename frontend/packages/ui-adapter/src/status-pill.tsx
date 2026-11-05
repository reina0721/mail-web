import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type StatusPillProps = Readonly<{
  children: ReactNode;
  tone?: StatusTone;
}>;

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function StatusPill({ children, tone = 'neutral' }: StatusPillProps) {
  return (
    <span
      className={`ui-status-pill inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

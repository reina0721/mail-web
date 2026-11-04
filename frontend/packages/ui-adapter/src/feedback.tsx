import type { ReactNode } from 'react';

import { Action } from './action';
import { IconAction } from './icon-action';

export type FeedbackTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type OptionalAlertAction =
  | Readonly<{ actionLabel: string; onAction: () => void }>
  | Readonly<{ actionLabel?: never; onAction?: never }>;

type OptionalSecondaryAction =
  | Readonly<{ secondaryActionLabel: string; onSecondaryAction: () => void }>
  | Readonly<{ secondaryActionLabel?: never; onSecondaryAction?: never }>;

type OptionalDismissAction =
  | Readonly<{ dismissLabel: string; onDismiss: () => void }>
  | Readonly<{ dismissLabel?: never; onDismiss?: never }>;

const softToneClass: Record<FeedbackTone, string> = {
  neutral: 'border-border bg-surface-muted text-ink',
  success: 'border-success/35 bg-success-soft text-success',
  warning: 'border-warning/35 bg-warning-soft text-warning',
  danger: 'border-danger/35 bg-danger-soft text-danger',
  info: 'border-info/35 bg-info-soft text-info',
};

const solidToneClass: Record<FeedbackTone, string> = {
  neutral: 'bg-ink text-surface',
  success: 'bg-success text-on-success',
  warning: 'bg-warning text-on-warning',
  danger: 'bg-danger text-on-danger',
  info: 'bg-info text-on-info',
};

export type BadgeProps = Readonly<{
  children: ReactNode;
  tone?: FeedbackTone;
  appearance?: 'soft' | 'solid';
  size?: 'sm' | 'md';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}>;

export function Badge({
  children,
  tone = 'neutral',
  appearance = 'soft',
  size = 'sm',
  leadingIcon,
  trailingIcon,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full font-semibold ${
        appearance === 'solid' ? solidToneClass[tone] : softToneClass[tone]
      } ${size === 'sm' ? 'gap-1 px-2.5 py-1 text-xs' : 'gap-1.5 px-3 py-1.5 text-sm'}`}
    >
      {leadingIcon ? <span aria-hidden="true">{leadingIcon}</span> : null}
      <span className="truncate">{children}</span>
      {trailingIcon ? <span aria-hidden="true">{trailingIcon}</span> : null}
    </span>
  );
}

export type AlertBannerProps = Readonly<
  {
    title: string;
    description: string;
    tone?: Exclude<FeedbackTone, 'neutral'>;
    icon: ReactNode;
    announcement?: 'none' | 'polite' | 'urgent';
  } & OptionalAlertAction &
    OptionalDismissAction
>;

export function AlertBanner({
  title,
  description,
  tone = 'info',
  icon,
  actionLabel,
  onAction,
  dismissLabel,
  onDismiss,
  announcement = 'none',
}: AlertBannerProps) {
  return (
    <section
      aria-label={title}
      className={`relative flex items-start gap-3 rounded-panel border p-4 ${softToneClass[tone]}`}
      {...(announcement === 'urgent'
        ? { role: 'alert' as const }
        : announcement === 'polite'
          ? { role: 'status' as const }
          : {})}
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface/70">
        {icon}
      </span>
      <div className={dismissLabel ? 'min-w-0 flex-1 pr-control-sm' : 'min-w-0 flex-1'}>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
        {actionLabel !== undefined ? (
          <div className="mt-3">
            <Action variant="secondary" size="sm" onPress={onAction}>
              {actionLabel}
            </Action>
          </div>
        ) : null}
      </div>
      {dismissLabel ? (
        <span className="absolute right-2 top-2">
          <IconAction label={dismissLabel} onPress={onDismiss} size="sm">
            <span aria-hidden="true">×</span>
          </IconAction>
        </span>
      ) : null}
    </section>
  );
}

export type NotificationCardProps = Readonly<
  {
    title: string;
    description: string;
    icon: ReactNode;
    primaryActionLabel: string;
    dismissLabel: string;
    onPrimaryAction: () => void;
    onDismiss: () => void;
  } & OptionalSecondaryAction
>;

export function NotificationCard({
  title,
  description,
  icon,
  primaryActionLabel,
  secondaryActionLabel,
  dismissLabel,
  onPrimaryAction,
  onSecondaryAction,
  onDismiss,
}: NotificationCardProps) {
  return (
    <section
      aria-label={title}
      className="relative rounded-panel border border-border bg-surface p-5"
    >
      <div className="flex items-start gap-3 pr-10">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-brand-soft text-brand">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {secondaryActionLabel !== undefined ? (
          <Action variant="secondary" size="sm" onPress={onSecondaryAction}>
            {secondaryActionLabel}
          </Action>
        ) : null}
        <Action size="sm" onPress={onPrimaryAction}>
          {primaryActionLabel}
        </Action>
      </div>
      <div className="absolute right-3 top-3">
        <IconAction label={dismissLabel} onPress={onDismiss}>
          <span aria-hidden="true">×</span>
        </IconAction>
      </div>
    </section>
  );
}

/* Pattern entry同时导出离开确认 Port 与视图组件，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */
import type { FormLifecycle } from '@community-go/form-foundation';
import { StatusPill } from '@community-go/ui-adapter/status-pill';
import type { ReactNode } from 'react';

import { StickyActions } from './layout';

export type LeaveConfirmationPort = Readonly<{
  confirmLeave: (message: string) => Promise<boolean>;
}>;

export function requestPageLeave({
  dirty,
  message,
  port,
}: Readonly<{
  dirty: boolean;
  message: string;
  port: LeaveConfirmationPort;
}>): Promise<boolean> {
  return dirty ? port.confirmLeave(message) : Promise.resolve(true);
}

export function FormStatus({
  lifecycle,
  labels,
}: Readonly<{
  lifecycle: FormLifecycle;
  labels: Readonly<Record<FormLifecycle, string>>;
}>) {
  const tone =
    lifecycle === 'submitted'
      ? 'success'
      : lifecycle === 'dirty' || lifecycle === 'invalid'
        ? 'warning'
        : 'neutral';
  return <StatusPill tone={tone}>{labels[lifecycle]}</StatusPill>;
}

export function FormActions({
  secondary,
  primary,
  summary,
}: Readonly<{ secondary?: ReactNode; primary: ReactNode; summary?: ReactNode }>) {
  return (
    <StickyActions>
      {summary ? <div className="mr-auto text-sm text-ink-muted">{summary}</div> : null}
      {secondary}
      {primary}
    </StickyActions>
  );
}

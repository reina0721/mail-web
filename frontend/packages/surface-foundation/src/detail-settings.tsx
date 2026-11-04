import { Panel } from '@community-go/ui-adapter/panel';
import type { ReactNode } from 'react';

export function EntitySummary({
  title,
  description,
  identity,
  status,
  actions,
  metadata,
}: Readonly<{
  title: string;
  description?: string;
  identity?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  metadata?: ReactNode;
}>) {
  return (
    <Panel className="p-5 sm:p-6">
      <div data-reveal-item className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          {identity}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-ink">{title}</h2>
              {status}
            </div>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {metadata ? (
        <div data-reveal-item className="mt-5 border-t border-border pt-5">
          {metadata}
        </div>
      ) : null}
    </Panel>
  );
}

export function SettingsLayout({
  navigation,
  children,
  persistentNavigation = false,
}: Readonly<{ navigation: ReactNode; children: ReactNode; persistentNavigation?: boolean }>) {
  return (
    <div
      className={`surface-settings-layout ${persistentNavigation ? 'surface-settings-layout-persistent' : ''}`}
    >
      <aside data-reveal-skip className="surface-settings-nav">
        {navigation}
      </aside>
      <div data-reveal-items className="min-w-0 space-y-5">
        {children}
      </div>
    </div>
  );
}

export type TimelineItem = Readonly<{
  id: string;
  title: string;
  description?: string;
  meta?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}>;

export function Timeline({
  label,
  items,
}: Readonly<{ label: string; items: readonly TimelineItem[] }>) {
  return (
    <ol aria-label={label} className="space-y-4">
      {items.map((item) => (
        <li data-reveal-item className="surface-timeline-item" key={item.id}>
          <span
            aria-hidden="true"
            className={`surface-timeline-marker surface-timeline-marker-${item.tone ?? 'neutral'}`}
          />
          <div className="min-w-0 border-b border-border pb-4 last:border-b-0">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold text-ink">{item.title}</p>
              {item.meta ? <span className="text-xs text-ink-muted">{item.meta}</span> : null}
            </div>
            {item.description ? (
              <p className="mt-1 text-sm leading-6 text-ink-muted">{item.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

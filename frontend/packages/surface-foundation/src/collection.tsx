import type { ReactNode } from 'react';
import { Action } from '@community-go/ui-adapter/action';

import { Section } from './layout';

export function Collection({
  title,
  description,
  count,
  tools,
  query,
  bulk,
  toolbar,
  filters,
  content,
  narrowContent,
  pagination,
}: Readonly<{
  title: string;
  description?: string;
  count?: string | number;
  tools?: ReactNode;
  query?: ReactNode;
  bulk?: ReactNode;
  toolbar?: ReactNode;
  filters?: ReactNode;
  content: ReactNode;
  narrowContent?: ReactNode;
  pagination?: ReactNode;
}>) {
  const headerAction = tools ? <div className="flex items-center gap-2">{tools}</div> : undefined;

  const titleNode =
    count !== undefined ? (
      <div className="flex items-center gap-2">
        <span>{title}</span>
        <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
          {count}
        </span>
      </div>
    ) : (
      title
    );

  return (
    <Section title={titleNode} action={headerAction} {...(description ? { description } : {})}>
      {query ? <div className="border-b border-border bg-surface-muted/50 p-3">{query}</div> : null}
      {bulk ? <div className="border-b border-border p-3">{bulk}</div> : null}
      {toolbar ? <div className="border-b border-border p-4">{toolbar}</div> : null}
      {filters ? <div className="border-b border-border p-4">{filters}</div> : null}
      <div className={narrowContent ? 'hidden min-w-0 md:block' : 'min-w-0'}>{content}</div>
      {narrowContent ? <div className="min-w-0 md:hidden">{narrowContent}</div> : null}
      {pagination ? <div className="border-t border-border p-4">{pagination}</div> : null}
    </Section>
  );
}

export function CollectionQuery({
  search,
  filters,
  view,
  reset,
  advanced,
  label = '集合筛选与搜索',
}: Readonly<{
  search?: ReactNode;
  filters?: ReactNode;
  view?: ReactNode;
  reset?: ReactNode;
  advanced?: ReactNode;
  label?: string;
}>) {
  return (
    <div role="search" aria-label={label} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {search ? <div className="min-w-64 flex-1">{search}</div> : null}
        {filters ? (
          <div className="flex flex-wrap items-center gap-2 border-border sm:border-l sm:pl-3">
            {filters}
          </div>
        ) : null}
        {view ? (
          <div className="flex flex-wrap items-center gap-2 border-border sm:border-l sm:pl-3">
            {view}
          </div>
        ) : null}
        {reset ? <div className="flex items-center">{reset}</div> : null}
      </div>
      {advanced ? <div className="pt-2">{advanced}</div> : null}
    </div>
  );
}

export function CollectionPagination({
  summary,
  pageSize,
  pager,
}: Readonly<{
  summary: ReactNode;
  pageSize?: ReactNode;
  pager: ReactNode;
}>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="text-ink-muted">{summary}</div>
      <div className="flex flex-wrap items-center gap-3">
        {pageSize}
        {pager}
      </div>
    </div>
  );
}

export function BulkActionBar({
  selectionLabel,
  actions,
  onClear,
  clearLabel,
}: Readonly<{
  selectionLabel: string;
  actions: ReactNode;
  onClear: () => void;
  clearLabel: string;
}>) {
  return (
    <div
      aria-label={selectionLabel}
      className="surface-bulk-bar flex flex-wrap items-center justify-between gap-3 rounded-panel border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-ink"
      role="toolbar"
    >
      <span aria-live="polite" className="font-semibold">
        {selectionLabel}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <Action size="sm" variant="quiet" onPress={onClear}>
          {clearLabel}
        </Action>
      </div>
    </div>
  );
}

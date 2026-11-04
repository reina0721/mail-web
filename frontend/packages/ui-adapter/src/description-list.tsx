import type { ReactNode } from 'react';

export type DescriptionItem = Readonly<{
  id: string;
  term: ReactNode;
  description: ReactNode;
}>;

export type DescriptionListProps = Readonly<{
  label: string;
  items: readonly DescriptionItem[];
  columns?: 1 | 2;
  emptyValue?: ReactNode;
}>;

export function DescriptionList({
  label,
  items,
  columns = 1,
  emptyValue = '—',
}: DescriptionListProps) {
  return (
    <dl
      aria-label={label}
      className={columns === 2 ? 'grid gap-x-6 gap-y-4 sm:grid-cols-2' : 'grid gap-4'}
    >
      {items.map((item) => (
        <div className="min-w-0" key={item.id}>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {item.term}
          </dt>
          <dd className="mt-1 break-words text-sm leading-6 text-ink">
            {item.description === null || item.description === undefined || item.description === ''
              ? emptyValue
              : item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}

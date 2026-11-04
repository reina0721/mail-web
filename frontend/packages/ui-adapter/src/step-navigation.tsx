import type { ReactNode } from 'react';

export type StepNavigationItem = Readonly<{
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  state?: 'upcoming' | 'current' | 'complete' | 'error';
  disabled?: boolean;
}>;

export type StepNavigationProps = Readonly<{
  label: string;
  items: readonly StepNavigationItem[];
  onNavigate?: (id: string) => void;
}>;

/** StepNavigation 表达有限步骤的当前位置，不承担路由实现。 */
export function StepNavigation({ label, items, onNavigate }: StepNavigationProps) {
  return (
    <nav aria-label={label}>
      <ol className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {items.map((item, index) => {
          const state = item.state ?? 'upcoming';
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-bold ${
                  state === 'current'
                    ? 'border-brand bg-brand text-on-brand'
                    : state === 'complete'
                      ? 'border-success bg-success-soft text-success'
                      : state === 'error'
                        ? 'border-danger bg-danger-soft text-danger'
                        : 'border-border bg-surface-muted text-ink-muted'
                }`}
              >
                {item.icon ?? index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </>
          );

          return (
            <li aria-current={state === 'current' ? 'step' : undefined} key={item.id}>
              {onNavigate ? (
                <button
                  className="flex w-full items-start gap-3 rounded-panel border border-border bg-surface p-3 text-start outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-disabled"
                  disabled={item.disabled}
                  onClick={() => onNavigate(item.id)}
                  type="button"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-start gap-3 rounded-panel border border-border bg-surface p-3">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

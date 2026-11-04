import { tv } from '@heroui/styles';
import type { HTMLAttributes, ReactNode } from 'react';

export type CardProps = Readonly<{
  children: ReactNode;
  appearance?: 'elevated' | 'outlined' | 'flat';
}> &
  Pick<HTMLAttributes<HTMLElement>, 'aria-label' | 'role'>;

const cardStyles = tv({
  base: 'overflow-hidden rounded-panel border text-ink',
  defaultVariants: { appearance: 'elevated' },
  variants: {
    appearance: {
      elevated: 'border-border bg-surface shadow-panel',
      flat: 'border-transparent bg-surface-muted shadow-none',
      outlined: 'border-border bg-surface shadow-none',
    },
  },
});

export function Card({ children, appearance = 'elevated', ...aria }: CardProps) {
  return (
    <section className={cardStyles({ appearance })} {...aria}>
      {children}
    </section>
  );
}

export type CardHeaderProps = Readonly<{
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}>;

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardContent({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="p-5">{children}</div>;
}

export function CardFooter({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
      {children}
    </footer>
  );
}

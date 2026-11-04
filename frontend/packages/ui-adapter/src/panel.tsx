import type { HTMLAttributes, ReactNode } from 'react';

export type PanelProps = Readonly<{
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'muted' | 'brand';
  appearance?: 'elevated' | 'outlined' | 'embedded';
}> &
  Pick<HTMLAttributes<HTMLElement>, 'aria-busy' | 'aria-label' | 'role'>;

const toneClass = {
  default: 'border-border bg-surface',
  muted: 'border-transparent bg-surface-muted',
  brand: 'border-brand/15 bg-brand-soft',
} as const;

const appearanceClass = {
  elevated: 'rounded-panel border shadow-panel',
  outlined: 'rounded-panel border shadow-none',
  embedded: 'border-0 shadow-none',
} as const;

export function Panel({
  children,
  className = '',
  tone = 'default',
  appearance = 'elevated',
  ...aria
}: PanelProps) {
  return (
    <section className={`${appearanceClass[appearance]} ${toneClass[tone]} ${className}`} {...aria}>
      {children}
    </section>
  );
}

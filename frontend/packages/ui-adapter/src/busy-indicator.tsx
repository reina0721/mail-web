import { Spinner as HeroSpinner } from '@heroui/react/spinner';

export type BusyIndicatorProps = Readonly<{
  label: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}>;

export function BusyIndicator({ label, size = 'md', showLabel = false }: BusyIndicatorProps) {
  return (
    <span
      aria-label={label}
      className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted"
      role="status"
    >
      <HeroSpinner
        aria-hidden="true"
        className="text-brand motion-reduce:animate-none"
        size={size}
      />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}

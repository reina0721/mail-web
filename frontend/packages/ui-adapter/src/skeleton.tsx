export type SkeletonProps = Readonly<{
  className?: string;
}>;

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <span
      data-slot="skeleton"
      className={`block animate-pulse rounded-control bg-surface-muted ${className}`}
      aria-hidden="true"
    />
  );
}

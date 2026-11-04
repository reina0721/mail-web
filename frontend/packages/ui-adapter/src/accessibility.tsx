import type { ReactNode } from 'react';

export type SkipLinkProps = Readonly<{
  href: `#${string}`;
  label: string;
}>;

/** SkipLink 为键盘用户提供绕过重复导航的稳定入口。 */
export function SkipLink({ href, label }: SkipLinkProps) {
  return (
    <a
      className="fixed start-4 top-4 z-overlay -translate-y-24 rounded-control bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-overlay outline-none transition-transform focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      href={href}
    >
      {label}
    </a>
  );
}

export type LiveRegionProps = Readonly<{
  children: ReactNode;
  priority?: 'polite' | 'assertive';
  atomic?: boolean;
  visuallyHidden?: boolean;
}>;

/** LiveRegion 统一异步状态对辅助技术的播报语义。 */
export function LiveRegion({
  children,
  priority = 'polite',
  atomic = true,
  visuallyHidden = true,
}: LiveRegionProps) {
  return (
    <div
      aria-atomic={atomic}
      aria-live={priority}
      className={visuallyHidden ? 'sr-only' : undefined}
      role={priority === 'assertive' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

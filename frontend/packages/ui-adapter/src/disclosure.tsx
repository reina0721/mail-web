import { Disclosure as HeroDisclosure } from '@heroui/react/disclosure';
import type { ReactNode } from 'react';

export type DisclosurePanelProps = Readonly<{
  title: string;
  children: ReactNode;
  description?: string;
  defaultExpanded?: boolean;
  disabled?: boolean;
}>;

/** DisclosurePanel 表达可展开的补充内容，不承担页面导航或业务状态。 */
export function DisclosurePanel({
  title,
  children,
  description,
  defaultExpanded = false,
  disabled = false,
}: DisclosurePanelProps) {
  return (
    <HeroDisclosure.Root
      className="rounded-panel border border-border bg-surface"
      defaultExpanded={defaultExpanded}
      isDisabled={disabled}
    >
      <HeroDisclosure.Heading>
        <HeroDisclosure.Trigger className="flex w-full items-center justify-between gap-4 rounded-panel px-4 py-3 text-start outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus disabled:text-ink-disabled">
          <span>
            <span className="block text-sm font-semibold text-ink">{title}</span>
            {description ? (
              <span className="mt-1 block text-sm text-ink-muted">{description}</span>
            ) : null}
          </span>
          <HeroDisclosure.Indicator className="size-icon-sm shrink-0 text-ink-muted transition-transform motion-reduce:transition-none">
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path
                d="m4 6 4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
            </svg>
          </HeroDisclosure.Indicator>
        </HeroDisclosure.Trigger>
      </HeroDisclosure.Heading>
      <HeroDisclosure.Content>
        <HeroDisclosure.Body className="border-t border-border px-4 py-3 text-sm leading-6 text-ink-muted">
          {children}
        </HeroDisclosure.Body>
      </HeroDisclosure.Content>
    </HeroDisclosure.Root>
  );
}

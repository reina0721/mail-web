import { Popover } from '@heroui/react/popover';
import { type ReactNode } from 'react';

export type PopoverCardProps = Readonly<{
  triggerLabel: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}>;

export function PopoverCard({
  triggerLabel,
  title,
  children,
  defaultOpen = false,
}: PopoverCardProps) {
  return (
    <Popover defaultOpen={defaultOpen}>
      <Popover.Trigger className="ui-overlay-trigger">{triggerLabel}</Popover.Trigger>
      <Popover.Content className="ui-overlay-surface max-w-sm" placement="bottom start">
        <Popover.Arrow className="fill-surface-raised stroke-border" />
        <Popover.Dialog className="p-4">
          <Popover.Heading className="text-sm font-bold text-ink">{title}</Popover.Heading>
          <div className="mt-2 text-sm leading-6 text-ink-muted">{children}</div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

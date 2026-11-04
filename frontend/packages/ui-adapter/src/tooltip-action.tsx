import { Tooltip } from '@heroui/react/tooltip';

export type TooltipActionProps = Readonly<{
  label: string;
  tooltip: string;
  defaultOpen?: boolean;
}>;

export function TooltipAction({ label, tooltip, defaultOpen = false }: TooltipActionProps) {
  return (
    <Tooltip defaultOpen={defaultOpen} delay={100}>
      <Tooltip.Trigger className="ui-overlay-trigger">{label}</Tooltip.Trigger>
      <Tooltip.Content
        className="rounded-control border border-border bg-ink px-3 py-2 text-xs font-medium text-surface shadow-overlay"
        placement="top"
        showArrow
      >
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}

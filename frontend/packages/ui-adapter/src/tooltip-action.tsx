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
        className="ui-icon-tooltip border border-border text-xs font-medium"
        placement="top"
        showArrow
      >
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}

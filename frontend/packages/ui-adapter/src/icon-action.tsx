import { Tooltip } from '@heroui/react/tooltip';
import { Button as HeroButton } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import type { ReactNode } from 'react';

type IconActionBehavior =
  | Readonly<{ onPress: () => void; disabled?: boolean }>
  | Readonly<{ onPress?: never; disabled: true }>;

export type IconActionProps = Readonly<{
  label: string;
  variant?: 'outlined' | 'quiet';
  children: ReactNode;
  active?: boolean;
  controls?: string;
  expanded?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md';
  tone?: 'neutral' | 'danger';
  tooltip?: boolean | string;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
}> &
  IconActionBehavior;

export function IconAction({
  label,
  children,
  controls,
  expanded,
  onPress,
  active,
  disabled = false,
  loading = false,
  size = 'md',
  tone = 'neutral',
  tooltip = false,
  tooltipPlacement = 'bottom',
  variant = 'outlined',
}: IconActionProps) {
  const tooltipText = typeof tooltip === 'string' ? tooltip : tooltip ? label : undefined;

  const button = (
    <HeroButton
      aria-busy={loading || undefined}
      aria-label={label}
      aria-pressed={active}
      className={`ui-icon-action ui-control-${size} ${variant === 'quiet' ? 'ui-icon-quiet' : ''}`}
      data-tone={tone}
      size={size}
      isDisabled={disabled}
      isIconOnly
      isPending={loading}
      variant={active ? 'secondary' : tone === 'danger' ? 'danger-soft' : variant === 'quiet' ? 'ghost' : 'outline'}
      {...(controls ? { 'aria-controls': controls } : {})}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
      {...(onPress ? { onPress } : {})}
    >
      {loading ? (
        <Spinner aria-hidden="true" size="sm" />
      ) : (
        children
      )}
    </HeroButton>
  );
  return tooltipText ? <Tooltip delay={350}>{button}<Tooltip.Content className="ui-icon-tooltip" placement={tooltipPlacement}>{tooltipText}</Tooltip.Content></Tooltip> : button;
}

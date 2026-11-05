import { Button as HeroButton } from '@heroui/react/button';
import type { ReactNode } from 'react';

/** Maps project overlay actions to HeroUI outline; interaction stays in HeroUI. */

type OverlayTriggerBehavior = Readonly<{
  type?: 'button';
  onPress?: () => void;
  disabled?: boolean;
}>;

export type OverlayTriggerActionProps = Readonly<{
  children: ReactNode;
  /** 语义 tone：default = 中性 trigger；danger = 危险语义 trigger。 */
  tone?: 'default' | 'danger';
  fullWidth?: boolean;
}> &
  OverlayTriggerBehavior;

export function OverlayTriggerAction({
  children,
  tone = 'default',
  fullWidth = false,
  disabled = false,
  type = 'button',
  onPress,
}: OverlayTriggerActionProps) {
  return (
    <HeroButton
      className="ui-action ui-action-secondary ui-control-md"
      data-tone={tone}
      fullWidth={fullWidth}
      isDisabled={disabled}
      type={type}
      variant="outline"
      {...(onPress ? { onPress } : {})}
    >
      {children}
    </HeroButton>
  );
}

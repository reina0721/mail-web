import { Button as HeroButton } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import type { ReactNode } from 'react';

type ActionBehavior =
  | Readonly<{ type?: 'button'; onPress: () => void; disabled?: boolean }>
  | Readonly<{ type: 'submit' | 'reset'; onPress?: () => void; disabled?: boolean }>
  | Readonly<{ type?: 'button'; onPress?: never; disabled: true }>;

export type ActionProps = Readonly<{
  children: ReactNode;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}> &
  ActionBehavior;

const buttonVariant = { primary: 'primary', secondary: 'outline', quiet: 'ghost', danger: 'danger' } as const;

export function Action({
  children,
  leadingIcon,
  trailingIcon,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
  onPress,
}: ActionProps) {
  return (
    <HeroButton
      aria-busy={loading || undefined}
      className={`ui-action ui-control-${size} ${variant === 'secondary' ? 'ui-action-secondary' : ''}`}
      fullWidth={fullWidth}
      size={size}
      isDisabled={disabled}
      isPending={loading}
      type={type}
      variant={buttonVariant[variant]}
      {...(onPress ? { onPress } : {})}
    >
      {loading ? (
        <Spinner aria-hidden="true" size="sm" />
      ) : leadingIcon ? (
        <span
          aria-hidden="true"
          className="grid size-icon-sm shrink-0 place-items-center text-current [&>svg]:m-0"
        >
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
      {trailingIcon ? (
        <span
          aria-hidden="true"
          className="grid size-icon-sm shrink-0 place-items-center text-current [&>svg]:m-0"
        >
          {trailingIcon}
        </span>
      ) : null}
    </HeroButton>
  );
}

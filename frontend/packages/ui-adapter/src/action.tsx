import { tv } from '@heroui/styles';
import { Button as HeroButton } from '@heroui/react/button';
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

const actionStyles = tv({
  base: 'inline-flex rounded-control font-semibold outline-none transition-colors',
  defaultVariants: {
    fullWidth: false,
    size: 'md',
    variant: 'primary',
  },
  variants: {
    fullWidth: {
      false: '',
      true: 'w-full',
    },
    size: {
      lg: 'h-control-lg gap-2.5 px-5 text-base',
      md: 'h-control gap-2 px-4 text-sm',
      sm: 'h-control-sm gap-1.5 px-3 text-sm',
    },
    variant: {
      danger: 'bg-danger text-on-danger shadow-sm hover:brightness-95',
      primary: 'bg-brand text-on-brand shadow-sm hover:bg-brand-strong',
      quiet: 'bg-transparent text-ink-muted hover:bg-surface-muted hover:text-ink',
      secondary: 'border border-border bg-surface text-ink shadow-sm hover:bg-surface-muted',
    },
  },
});

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
      className={actionStyles({ fullWidth, size, variant })}
      isDisabled={disabled}
      isPending={loading}
      type={type}
      variant="ghost"
      {...(onPress ? { onPress } : {})}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-icon-sm animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
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

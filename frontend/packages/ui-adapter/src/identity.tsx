import { tv } from '@heroui/styles';
import { Avatar as HeroAvatar } from '@heroui/react/avatar';
import type { ReactNode } from 'react';

export type AvatarPresence = Readonly<{
  label: string;
  tone: 'neutral' | 'success' | 'warning';
}>;

export type AvatarProps = Readonly<{
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  presence?: AvatarPresence;
}>;

const avatarStyles = tv({
  base: 'shrink-0 overflow-hidden rounded-full bg-surface-inset text-ink',
  defaultVariants: { size: 'md' },
  variants: {
    size: {
      lg: 'size-12 text-base',
      md: 'size-9 text-sm',
      sm: 'size-7 text-xs',
    },
  },
});

const presenceStyles = tv({
  base: 'absolute bottom-0 right-0 rounded-full border-2 border-surface',
  defaultVariants: { size: 'md', tone: 'neutral' },
  variants: {
    size: {
      lg: 'size-3.5',
      md: 'size-3',
      sm: 'size-2.5',
    },
    tone: {
      neutral: 'bg-ink-muted',
      success: 'bg-success',
      warning: 'bg-warning',
    },
  },
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : name.slice(0, 2))
    .toLocaleUpperCase()
    .slice(0, 2);
}

export function Avatar({ name, src, size = 'md', presence }: AvatarProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <HeroAvatar className={avatarStyles({ size })}>
        {src ? <HeroAvatar.Image alt={name} src={src} /> : null}
        <HeroAvatar.Fallback
          aria-label={name}
          className="grid size-full place-items-center font-bold"
        >
          {initials(name)}
        </HeroAvatar.Fallback>
      </HeroAvatar>
      {presence ? (
        <span
          aria-label={presence.label}
          className={presenceStyles({ size, tone: presence.tone })}
          role="img"
        />
      ) : null}
    </span>
  );
}

export type UserIdentityProps = Readonly<{
  name: string;
  description?: ReactNode;
  avatarSrc?: string;
  avatarSize?: 'sm' | 'md' | 'lg';
  presence?: AvatarPresence;
}>;

export function UserIdentity({
  name,
  description,
  avatarSrc,
  avatarSize = 'md',
  presence,
}: UserIdentityProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <Avatar
        name={name}
        size={avatarSize}
        {...(avatarSrc ? { src: avatarSrc } : {})}
        {...(presence ? { presence } : {})}
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{name}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-ink-muted">{description}</span>
        ) : null}
      </span>
    </span>
  );
}

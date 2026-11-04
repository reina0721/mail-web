import { tv } from '@heroui/styles';
import { Button as HeroButton } from '@heroui/react/button';
import type { ReactNode } from 'react';

/**
 * OverlayTriggerAction —— Overlay Trigger 的共享语义按钮。
 *
 * Overlay Trigger 只负责打开 Dialog / Drawer / Command / Popover 等浮层：
 * 点击后真正的状态变化发生在 Overlay 本身，Trigger 不应临时切换成 Brand Primary。
 *
 * 实现要点：
 * - 底层 HeroButton 显式 `variant="ghost"`：HeroUI buttonVariants 默认 variant="primary"
 *   会把 --button-bg* 指向 --accent（HeroUI 默认主题的蓝）；ghost 的 --button-bg* 是透明/
 *   中性，杜绝 Brand Blue 注入。
 * - 语义色由本项目 tv 定义：default 为中性 secondary 外观，danger 保持 danger 语义；
 *   pressed / hover 只做同语义的深浅反馈，不换语义色。
 * - focus-visible 保留项目 focus-ring（可访问性反馈不因“不变蓝”被删除）。
 */

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

const overlayTriggerStyles = tv({
  base: 'inline-flex min-h-control items-center justify-center gap-2 rounded-control px-3.5 text-sm font-semibold shadow-sm outline-none transition-colors',
  defaultVariants: {
    fullWidth: false,
    tone: 'default',
  },
  variants: {
    fullWidth: {
      false: '',
      true: 'w-full',
    },
    tone: {
      // 中性：白底 + 边框；pressed/hover 用 surface-muted 深浅反馈，绝不切 Brand。
      default:
        'border border-border bg-surface text-ink hover:bg-surface-muted data-[hovered=true]:bg-surface-muted data-[pressed=true]:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
      // 危险：保持 danger 语义；pressed/hover 用 danger-soft，绝不切 Brand。
      danger:
        'border border-danger/30 bg-surface text-danger hover:bg-danger-soft data-[hovered=true]:bg-danger-soft data-[pressed=true]:bg-danger-soft focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
    },
  },
});

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
      className={overlayTriggerStyles({ fullWidth, tone })}
      isDisabled={disabled}
      type={type}
      variant="ghost"
      {...(onPress ? { onPress } : {})}
    >
      {children}
    </HeroButton>
  );
}

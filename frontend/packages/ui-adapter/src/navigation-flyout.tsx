import { Popover } from '@heroui/react/popover';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export { default as NavigationHint } from './navigation-hint';

const navigationFlyoutCloseDelayMs = 140;
// Compact Navigation 属于非模态子菜单；Pointer 打开时保持当前焦点，键盘打开时仍进入 Overlay。
const navigationFlyoutTrigger = 'SubmenuTrigger';

export type NavigationFlyoutProps = Readonly<{
  label: string;
  icon: ReactNode;
  active?: boolean;
  isOpen: boolean;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}>;

export function NavigationFlyout({
  label,
  icon,
  active = false,
  isOpen,
  children,
  onOpenChange,
}: NavigationFlyoutProps) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openRef = useRef(isOpen);
  const ignoreNextPressCloseRef = useRef(false);
  const pointerOverTriggerRef = useRef(false);
  const pointerOverContentRef = useRef(false);
  const pinnedRef = useRef(false);
  const focusWithinContentRef = useRef(false);
  // 父级（Compact Shell 的 openBranchId）直接关闭时不会经过 requestOpenChange，internalClose 保持 false；
  // 此时跳过 Popover 退出动画，避免旧菜单退出层与新菜单进入层短暂叠加。
  const [internalClose, setInternalClose] = useState(false);
  // 渲染后同步的 isOpen 快照：延迟关闭回调在计时器触发时读取最新值，
  // 避免闭包捕获旧 isOpen 导致父级已关闭后仍向上冒泡误关新菜单。
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    openRef.current = isOpen;
    isOpenRef.current = isOpen;
    if (!isOpen) pinnedRef.current = false;
  }, [isOpen]);

  const skipExitAnimation = !isOpen && !internalClose;

  const cancelScheduledClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  };
  const requestOpenChange = (open: boolean) => {
    if (openRef.current === open) return;
    // 父级已通过 isOpen prop 关闭（兄弟切换或叶子导航）后，延迟关闭回调不能再向上冒泡，
    // 否则会把新打开的兄弟菜单误关。
    if (!open && !isOpenRef.current) return;
    openRef.current = open;
    // 只有真正由本 Flyout 内部发起的关闭（指针离开计时器、RAC 用户关闭）才播放退出动画；
    // 父级直接替换 openBranchId 的关闭保持 internalClose=false，跳过退出动画。
    setInternalClose(!open);
    onOpenChange(open);
  };
  const scheduleClose = () => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = undefined;
      if (
        !pointerOverTriggerRef.current &&
        !pointerOverContentRef.current &&
        !pinnedRef.current &&
        !focusWithinContentRef.current
      ) {
        requestOpenChange(false);
      }
    }, navigationFlyoutCloseDelayMs);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      cancelScheduledClose();
      if (!openRef.current) pinnedRef.current = true;
    }
    if (!open && ignoreNextPressCloseRef.current) {
      ignoreNextPressCloseRef.current = false;
      return;
    }
    // RAC 在父级已通过 isOpen prop 关闭后也会回调 onOpenChange(false)；
    // 此时关闭由父级发起，不再向上冒泡，避免旧菜单的回调误关新打开的兄弟菜单。
    if (!open && !isOpenRef.current) return;
    if (!open) pinnedRef.current = false;
    requestOpenChange(open);
  };

  useEffect(() => () => cancelScheduledClose(), []);

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger<'button'>
        aria-label={label}
        className="ui-navigation-icon-trigger"
        data-active={active || undefined}
        data-open={isOpen || undefined}
        data-navigation-control
        render={(triggerProps) => <button {...triggerProps} type="button" />}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return;
          pointerOverTriggerRef.current = true;
          cancelScheduledClose();
          requestOpenChange(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'mouse') return;
          pointerOverTriggerRef.current = false;
          scheduleClose();
        }}
        onPointerDownCapture={(event) => {
          ignoreNextPressCloseRef.current =
            event.pointerType === 'mouse' && openRef.current && !pinnedRef.current;
          pinnedRef.current = true;
        }}
      >
        <span aria-hidden="true" className="ui-navigation-icon">
          {icon}
        </span>
        <svg
          aria-hidden="true"
          className="absolute end-1 bottom-1 size-3"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="m6 4 4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Popover.Trigger>
      <Popover.Content
        aria-label={label}
        className="ui-overlay-surface w-72 p-2"
        isNonModal
        placement="right top"
        shouldSkipAnimation={skipExitAnimation}
        trigger={navigationFlyoutTrigger}
        shouldCloseOnInteractOutside={(element) => !element.closest('[data-navigation-control]')}
        onPointerEnter={() => {
          pointerOverContentRef.current = true;
          cancelScheduledClose();
        }}
        onPointerLeave={() => {
          pointerOverContentRef.current = false;
          scheduleClose();
        }}
      >
        <Popover.Arrow className="fill-surface-raised stroke-border" />
        <div
          onFocusCapture={() => {
            focusWithinContentRef.current = true;
            cancelScheduledClose();
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              focusWithinContentRef.current = false;
              scheduleClose();
            }
          }}
        >
          <p className="border-b border-border px-3 py-2 text-sm font-semibold text-ink">{label}</p>
          {children}
        </div>
      </Popover.Content>
    </Popover>
  );
}

import { Drawer } from '@heroui/react/drawer';
import { OverlayTriggerAction } from './overlay-trigger';
import { useState, type ReactNode } from 'react';

export type DrawerSurfaceProps = Readonly<{
  triggerLabel: string;
  title: string;
  description: string;
  children: ReactNode;
  closeLabel: string;
  defaultOpen?: boolean;
  placement?: 'left' | 'right';
  composition?: 'standard' | 'navigation';
  /** 受控模式：提供 isOpen/onOpenChange 时隐藏 trigger，由父级控制开关。 */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}>;

export function DrawerSurface({
  triggerLabel,
  title,
  description,
  children,
  closeLabel,
  defaultOpen = false,
  isOpen,
  onOpenChange,
  placement = 'right',
  composition = 'standard',
}: DrawerSurfaceProps) {
  const controlled = isOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlled ? isOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      {controlled ? null : <OverlayTriggerAction>{triggerLabel}</OverlayTriggerAction>}
      <Drawer.Backdrop className="ui-overlay-motion bg-scrim backdrop-blur-sm">
        <Drawer.Content className="ui-overlay-motion" placement={placement}>
          <Drawer.Dialog
            className={`ui-overlay-surface relative h-full w-full rounded-none ${composition === 'navigation' ? 'max-w-sm' : 'max-w-lg'}`}
          >
            <Drawer.Header className="border-b border-border px-6 py-5 pr-20">
              <Drawer.Heading className="text-lg font-bold text-ink">{title}</Drawer.Heading>
              <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
              <Drawer.CloseTrigger
                aria-label={closeLabel}
                className="absolute right-5 top-5 grid size-10 place-items-center rounded-control border border-border bg-surface text-xl leading-none text-ink shadow-sm hover:bg-surface-muted"
              >
                <span aria-hidden="true">×</span>
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body
              className={composition === 'navigation' ? 'min-h-0 p-0' : 'min-h-0 px-6 py-5'}
            >
              {children}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button as HeroButton } from '@heroui/react/button';
import { OverlayTriggerAction } from './overlay-trigger';
import { useRef, useState, type ReactNode } from 'react';

export type ConfirmDialogProps = Readonly<{
  triggerLabel: string;
  title: string;
  description: string;
  impact: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  failureMessage: string;
  tone?: 'primary' | 'danger';
  defaultOpen?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  /**
   * 受控模式：提供 isOpen/onOpenChange 时隐藏 trigger，由父级控制开关
   * （Host leave-confirm 等命令式确认场景）。triggerLabel 仍须提供（无障碍命名）。
   */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}>;

export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  impact,
  cancelLabel,
  confirmLabel,
  failureMessage,
  tone = 'primary',
  defaultOpen = false,
  confirmDisabled = false,
  onConfirm,
  isOpen,
  onOpenChange,
}: ConfirmDialogProps) {
  const controlled = isOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlled ? isOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={(next) => {
        if (!pendingRef.current) setOpen(next);
      }}
    >
      {controlled ? null : (
        <OverlayTriggerAction
          tone={tone === 'danger' ? 'danger' : 'default'}
          onPress={() => setOpen(true)}
        >
          {triggerLabel}
        </OverlayTriggerAction>
      )}
      <AlertDialog.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={pending}
        className="ui-overlay-motion bg-scrim backdrop-blur-sm"
      >
        <AlertDialog.Container className="ui-overlay-motion" placement="center" size="md">
          <AlertDialog.Dialog className="ui-overlay-surface ui-dialog-layout w-full">
            <AlertDialog.Header className="px-6 pt-6">
              <AlertDialog.Icon status={tone === 'danger' ? 'danger' : 'accent'} />
              <AlertDialog.Heading className="mt-4 text-lg font-bold text-ink">
                {title}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="ui-dialog-body px-6 py-4 text-sm leading-6 text-ink-muted">
              <p>{description}</p>
              <div className="mt-3 rounded-control bg-surface-muted p-3 text-ink">{impact}</div>
              {failed ? (
                <p className="mt-3 font-medium text-danger" role="alert">
                  {failureMessage}
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
              <AlertDialog.CloseTrigger
                aria-label={cancelLabel}
                className="static inline-flex min-h-control w-auto min-w-20 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold leading-none text-ink shadow-sm hover:bg-surface-muted"
                isDisabled={pending}
              >
                {cancelLabel}
              </AlertDialog.CloseTrigger>
              <HeroButton
                className={`inline-flex min-h-control items-center justify-center rounded-control px-4 text-sm font-semibold ${tone === 'danger' ? 'bg-danger text-on-danger hover:bg-danger/90' : 'bg-brand text-on-brand hover:bg-brand-strong'}`}
                isDisabled={confirmDisabled || pending}
                isPending={pending}
                onPress={() => void confirm()}
              >
                {confirmLabel}
              </HeroButton>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

export type DestructiveConfirmDialogProps = Omit<ConfirmDialogProps, 'tone'>;

export function DestructiveConfirmDialog(props: DestructiveConfirmDialogProps) {
  return <ConfirmDialog {...props} tone="danger" />;
}

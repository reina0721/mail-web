import { Spinner as HeroSpinner } from '@heroui/react/spinner';
import { Toast, type ToastQueue, type ToastContentValue } from '@heroui/react/toast';

/** Presentation is loaded on first feedback; the owning provider keeps the vendor queue alive. */
export function FeedbackToastRegion({
  queue,
  closeLabel,
}: Readonly<{ queue: ToastQueue<ToastContentValue>; closeLabel: string }>) {
  return (
    <Toast.Provider className="z-toast" maxVisibleToasts={3} placement="bottom end" queue={queue}>
      {({ toast }) => {
        const content = toast.content;
        return (
          <Toast
            className="border-border bg-surface-raised text-ink shadow-overlay"
            toast={toast}
            variant={content.variant}
          >
            {content.isLoading ? (
              <Toast.Indicator variant={content.variant}>
                <HeroSpinner aria-hidden="true" size="sm" />
              </Toast.Indicator>
            ) : (
              <Toast.Indicator variant={content.variant} />
            )}
            <Toast.Content>
              {content.title ? <Toast.Title>{content.title}</Toast.Title> : null}
              {content.description ? (
                <Toast.Description>{content.description}</Toast.Description>
              ) : null}
            </Toast.Content>
            {content.actionProps?.children ? <Toast.ActionButton {...content.actionProps} /> : null}
            <Toast.CloseButton aria-label={closeLabel} />
          </Toast>
        );
      }}
    </Toast.Provider>
  );
}

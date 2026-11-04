import { Switch } from '@heroui/react/switch';
import { useId } from 'react';

export type SwitchFieldProps = Readonly<{
  label: string;
  description: string;
  checked: boolean;
  presentation?: 'card' | 'row';
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}>;

export function SwitchField({
  label,
  description,
  checked,
  disabled = false,
  onCheckedChange,
  presentation = 'card',
}: SwitchFieldProps) {
  const descriptionId = useId();
  return (
    <Switch
      aria-label={label}
      {...(description ? { 'aria-describedby': descriptionId } : {})}
      className="group w-full min-w-0"
      isDisabled={disabled}
      isSelected={checked}
      onChange={onCheckedChange}
    >
      <Switch.Content
        className={`ui-switch-content ${presentation === 'row' ? 'px-3 py-2' : 'rounded-panel border border-border bg-surface p-4'}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          {description ? (
            <span id={descriptionId} className="mt-1 block text-xs leading-5 text-ink-muted">
              {description}
            </span>
          ) : null}
        </span>
        <Switch.Control className="flex h-6 w-11 shrink-0 items-center rounded-full bg-border-strong p-0.5 transition-colors group-data-[selected=true]:bg-brand">
          <Switch.Thumb className="ms-0 size-5 rounded-full bg-surface shadow-sm group-data-[selected=true]:ms-5" />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

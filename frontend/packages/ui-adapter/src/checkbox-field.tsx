import { Checkbox } from '@heroui/react/checkbox';
import { useId } from 'react';

type CheckboxChangeProps =
  | Readonly<{ disabled: true; onCheckedChange?: never }>
  | Readonly<{ disabled?: false; onCheckedChange: (checked: boolean) => void }>
  | Readonly<{ disabled: boolean; onCheckedChange: (checked: boolean) => void }>;

export type CheckboxFieldProps = Readonly<{
  label: string;
  description?: string;
  checked: boolean;
}> &
  CheckboxChangeProps;

export function CheckboxField({
  label,
  description,
  checked,
  disabled = false,
  onCheckedChange,
}: CheckboxFieldProps) {
  const descriptionId = useId();
  return (
    <Checkbox
      aria-label={label}
      {...(description ? { 'aria-describedby': descriptionId } : {})}
      className="ui-checkbox-field w-full min-w-0 text-sm"
      isDisabled={disabled}
      isSelected={checked}
      {...(onCheckedChange ? { onChange: onCheckedChange } : {})}
    >
      <Checkbox.Content className="ui-choice-content">
        <Checkbox.Control className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-control border border-border-strong bg-surface text-on-brand">
          <Checkbox.Indicator className="pointer-events-none">✓</Checkbox.Indicator>
        </Checkbox.Control>
        <span className="flex min-w-0 flex-col items-start">
          <span className="block font-semibold text-ink">{label}</span>
          {description ? (
            <span id={descriptionId} className="mt-1 block text-xs leading-5 text-ink-muted">
              {description}
            </span>
          ) : null}
        </span>
      </Checkbox.Content>
    </Checkbox>
  );
}

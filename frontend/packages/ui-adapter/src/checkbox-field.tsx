import { Checkbox } from '@heroui/react/checkbox';
import { useId } from 'react';

type CheckboxChangeProps =
  | Readonly<{ disabled: true; onCheckedChange?: never }>
  | Readonly<{ disabled?: false; onCheckedChange: (checked: boolean) => void }>
  | Readonly<{ disabled: boolean; onCheckedChange: (checked: boolean) => void }>;

export type CheckboxFieldProps = Readonly<{
  label: string;
  labelVisibility?: 'visible' | 'screen-reader';
  description?: string;
  checked: boolean;
  indeterminate?: boolean;
}> &
  CheckboxChangeProps;

export function CheckboxField({
  label,
  labelVisibility = 'visible',
  description,
  checked,
  indeterminate = false,
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
      isIndeterminate={indeterminate}
      {...(onCheckedChange ? { onChange: onCheckedChange } : {})}
    >
      <Checkbox.Content className="ui-checkbox-content">
        <Checkbox.Control className="ui-checkbox-control" data-state={indeterminate ? 'mixed' : checked ? 'selected' : 'empty'}>
          <Checkbox.Indicator className="ui-checkbox-indicator" />
        </Checkbox.Control>
        <span className={labelVisibility === 'screen-reader' ? 'sr-only' : 'flex min-w-0 flex-col items-start'}>
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

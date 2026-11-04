import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import type { FieldTextProps } from './field-contract';

export type SelectOption = Readonly<{
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}>;

export type SelectFieldProps = FieldTextProps &
  Readonly<{
    name?: string;
    value?: string | null;
    defaultValue?: string;
    options: readonly SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    defaultOpen?: boolean;
    onValueChange?: (value: string) => void;
    presentation?: 'field' | 'toolbar';
  }>;

export function SelectField({
  label,
  hint,
  error,
  options,
  value,
  defaultValue,
  placeholder,
  disabled = false,
  defaultOpen = false,
  onValueChange,
  name,
  presentation = 'field',
}: SelectFieldProps) {
  const disabledKeys = options.filter((option) => option.disabled).map((option) => option.value);
  const isToolbar = presentation === 'toolbar';

  return (
    <Select
      className={isToolbar ? 'inline-flex shrink-0' : 'ui-field'}
      defaultOpen={defaultOpen}
      disabledKeys={disabledKeys}
      fullWidth={!isToolbar}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      onChange={(key) => {
        if (key !== null) onValueChange?.(String(key));
      }}
      {...(defaultValue ? { defaultValue } : {})}
      {...(name ? { name } : {})}
      {...(placeholder ? { placeholder } : {})}
      {...(value !== undefined ? { value } : {})}
    >
      {isToolbar ? (
        <Label className="sr-only">{label}</Label>
      ) : (
        <Label className="ui-field-label">{label}</Label>
      )}
      <Select.Trigger
        className={
          isToolbar
            ? 'flex h-control-sm min-w-32 items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-sm text-ink outline-none transition-colors hover:bg-surface-muted focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-focus'
            : 'ui-field-control flex items-center justify-between gap-3'
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm">
          {isToolbar ? <span className="shrink-0 text-ink-muted">{label}:</span> : null}
          <Select.Value className="truncate font-medium text-ink" />
        </span>
        <Select.Indicator className="size-3.5 shrink-0 text-ink-muted" />
      </Select.Trigger>
      {error && !isToolbar ? (
        <FieldError className="ui-field-error">{error}</FieldError>
      ) : hint && !isToolbar ? (
        <Description className="ui-field-hint">{hint}</Description>
      ) : null}
      <Select.Popover className="ui-overlay-surface ui-anchored-overlay-match-trigger">
        <ListBox className="ui-listbox">
          {options.map((option) => (
            <ListBox.Item
              className="ui-option"
              id={option.value}
              key={option.value}
              textValue={option.label}
            >
              <span className="min-w-0">
                <Label className="block truncate font-medium">{option.label}</Label>
                {option.description ? (
                  <Description className="mt-0.5 block text-xs text-ink-muted">
                    {option.description}
                  </Description>
                ) : null}
              </span>
              <ListBox.ItemIndicator className="text-brand" />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

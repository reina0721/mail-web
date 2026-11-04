import { ComboBox } from '@heroui/react/combo-box';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import type { FieldTextProps } from './field-contract';
import type { SelectOption } from './select-field';

export type ComboFieldProps = FieldTextProps &
  Readonly<{
    value?: string | null;
    options: readonly SelectOption[];
    placeholder: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
  }>;

export function ComboField({
  label,
  hint,
  error,
  value,
  options,
  placeholder,
  disabled = false,
  onValueChange,
}: ComboFieldProps) {
  const disabledKeys = options.filter((option) => option.disabled).map((option) => option.value);
  return (
    <ComboBox
      className="ui-field"
      disabledKeys={disabledKeys}
      fullWidth
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      menuTrigger="focus"
      onSelectionChange={(key) => {
        if (key !== null) onValueChange?.(String(key));
      }}
      {...(value !== undefined ? { selectedKey: value } : {})}
    >
      <Label className="ui-field-label">{label}</Label>
      <ComboBox.InputGroup>
        <Input
          className="ui-field-control min-w-0 flex-1 pe-7"
          fullWidth
          placeholder={placeholder}
        />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      {error ? (
        <FieldError className="ui-field-error">{error}</FieldError>
      ) : hint ? (
        <Description className="ui-field-hint">{hint}</Description>
      ) : null}
      <ComboBox.Popover className="ui-overlay-surface ui-anchored-overlay-match-trigger">
        <ListBox className="ui-listbox">
          {options.map((option) => (
            <ListBox.Item
              className="ui-option"
              id={option.value}
              key={option.value}
              textValue={option.label}
            >
              <Label className="truncate">{option.label}</Label>
              <ListBox.ItemIndicator className="text-brand" />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

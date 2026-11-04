import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextField as HeroTextField } from '@heroui/react/textfield';
import type { ChangeEvent, FocusEvent, Ref } from 'react';
import type { FieldTextProps, FieldValueProps } from './field-contract';

export type TextFieldProps = FieldTextProps &
  FieldValueProps &
  Readonly<{
    name?: string;
    ref?: Ref<HTMLInputElement>;
    placeholder?: string;
    disabled?: boolean;
    purpose?: 'text' | 'email';
    autoComplete?: 'name' | 'email' | 'username' | 'off';
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  }>;

export function TextField({
  label,
  hint,
  error,
  disabled = false,
  name,
  value,
  defaultValue,
  purpose = 'text',
  ...inputProps
}: TextFieldProps) {
  return (
    <HeroTextField
      className="ui-field"
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      {...(name ? { name } : {})}
      {...(value !== undefined ? { value } : {})}
      {...(defaultValue !== undefined ? { defaultValue } : {})}
    >
      <Label className="ui-field-label">{label}</Label>
      <Input className="ui-field-control" type={purpose} {...inputProps} />
      {error ? (
        <FieldError className="ui-field-error">{error}</FieldError>
      ) : hint ? (
        <Description className="ui-field-hint">{hint}</Description>
      ) : null}
    </HeroTextField>
  );
}

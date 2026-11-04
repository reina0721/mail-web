import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Label } from '@heroui/react/label';
import { TextArea } from '@heroui/react/textarea';
import { TextField as HeroTextField } from '@heroui/react/textfield';
import type { ChangeEvent, FocusEvent, Ref } from 'react';
import type { FieldTextProps, FieldValueProps } from './field-contract';

export type TextAreaFieldProps = FieldTextProps &
  FieldValueProps &
  Readonly<{
    name?: string;
    ref?: Ref<HTMLTextAreaElement>;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    content?: 'text' | 'code';
    onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  }>;

export function TextAreaField({
  label,
  hint,
  error,
  disabled = false,
  rows = 4,
  content = 'text',
  name,
  value,
  defaultValue,
  ...inputProps
}: TextAreaFieldProps) {
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
      <TextArea
        className={`ui-field-control resize-y py-3 ${content === 'code' ? 'font-mono text-xs' : ''}`}
        rows={rows}
        spellCheck={content === 'code' ? false : undefined}
        autoCapitalize={content === 'code' ? 'none' : undefined}
        autoCorrect={content === 'code' ? 'off' : undefined}
        {...inputProps}
      />
      {error ? (
        <FieldError className="ui-field-error">{error}</FieldError>
      ) : hint ? (
        <Description className="ui-field-hint">{hint}</Description>
      ) : null}
    </HeroTextField>
  );
}

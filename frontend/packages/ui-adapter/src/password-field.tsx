'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Button } from '@heroui/react/button';
import { Label } from '@heroui/react/label';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import type { TextFieldProps } from './text-field';

export type PasswordFieldProps = Omit<TextFieldProps, 'purpose' | 'autoComplete'> &
  Readonly<{
    purpose: 'current' | 'new';
    showLabel: string;
    hideLabel: string;
    visibilityIcons?: Readonly<{ show: ReactNode; hide: ReactNode }>;
  }>;
export function PasswordField({
  label,
  hint,
  error,
  disabled = false,
  name,
  value,
  defaultValue,
  purpose,
  showLabel,
  hideLabel,
  visibilityIcons,
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      className="ui-field"
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      {...(name ? { name } : {})}
      {...(value !== undefined ? { value } : {})}
      {...(defaultValue !== undefined ? { defaultValue } : {})}
    >
      <Label className="ui-field-label">{label}</Label>
      <InputGroup className="ui-field-control flex min-w-0 gap-2" fullWidth>
        <InputGroup.Input
          className="w-0 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-sm text-ink shadow-none outline-none"
          type={visible ? 'text' : 'password'}
          autoComplete={purpose === 'new' ? 'new-password' : 'current-password'}
          {...inputProps}
        />
        <InputGroup.Suffix className="bg-transparent p-0">
          <Button
            type="button"
            variant="ghost"
            isDisabled={disabled}
            aria-pressed={visible}
            aria-label={visible ? hideLabel : showLabel}
            isIconOnly={Boolean(visibilityIcons)}
            className="min-h-control-sm rounded-control border-0 bg-transparent px-2 text-xs font-medium text-ink-muted shadow-none data-[hovered]:text-ink data-[focus-visible]:ring-2 data-[focus-visible]:ring-focus-ring"
            onPress={() => setVisible((current) => !current)}
          >
            {visibilityIcons
              ? visible
                ? visibilityIcons.hide
                : visibilityIcons.show
              : visible
                ? hideLabel
                : showLabel}
          </Button>
        </InputGroup.Suffix>
      </InputGroup>
      {error ? (
        <FieldError className="ui-field-error">{error}</FieldError>
      ) : hint ? (
        <Description className="ui-field-hint">{hint}</Description>
      ) : null}
    </TextField>
  );
}

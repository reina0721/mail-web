import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Label } from '@heroui/react/label';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import type { FieldTextProps } from './field-contract';
import { useId, type ReactNode } from 'react';

export type RadioOption = Readonly<{
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  /** Decorative comparison only; interactive descendants are not supported. */
  preview?: ReactNode;
}>;

export type RadioGroupFieldProps = FieldTextProps &
  Readonly<{
    value: string;
    options: readonly RadioOption[];
    presentation?: 'cards' | 'rows' | 'tiles' | 'inline' | 'previews';
    labelIcon?: ReactNode;
    disabled?: boolean;
    onValueChange: (value: string) => void;
  }>;

export function RadioGroupField({
  label,
  hint,
  error,
  value,
  options,
  disabled = false,
  onValueChange,
  presentation = 'cards',
  labelIcon,
}: RadioGroupFieldProps) {
  const descriptionId = useId();
  const comparison = presentation === 'previews';
  const compact = presentation === 'inline';
  const hintFirst = presentation === 'tiles' || comparison;
  return (
    <RadioGroup
      className="ui-field @container"
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      value={value}
      onChange={onValueChange}
    >
      <div className="flex min-w-0 items-start gap-3">
        {labelIcon ? (
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
          >
            {labelIcon}
          </span>
        ) : null}
        <div className="grid min-w-0 gap-1">
          <Label className="ui-field-label">{label}</Label>
          {hintFirst && hint && !error ? (
            <Description className="ui-field-hint">{hint}</Description>
          ) : null}
        </div>
      </div>
      <div
        className={
          presentation === 'rows'
            ? 'grid gap-2'
            : comparison
              ? 'grid grid-cols-1 gap-3 @sm:grid-cols-3'
              : presentation === 'tiles'
                ? 'grid grid-cols-1 gap-3 @sm:grid-cols-3'
                : compact
                  ? 'flex flex-wrap gap-2'
                  : 'surface-filter-grid'
        }
      >
        {options.map((option, index) => (
          <Radio
            aria-label={option.label}
            {...(option.description ? { 'aria-describedby': `${descriptionId}-${index}` } : {})}
            className={`group min-w-0 text-sm ${compact ? 'mt-0 max-w-full' : 'w-full'} ${presentation === 'tiles' || comparison ? 'mt-0 h-full' : ''}`}
            key={option.value}
            value={option.value}
            {...(option.disabled ? { isDisabled: true } : {})}
          >
            <Radio.Content
              className={`ui-choice-content border border-border bg-surface group-data-[selected]:border-brand group-data-[selected]:bg-brand-soft ${comparison ? 'h-full min-h-24 gap-3 rounded-control p-3 text-ink group-data-[selected]:text-brand @sm:flex-col @sm:justify-between @sm:gap-4 @sm:rounded-panel @sm:p-4' : presentation === 'rows' || compact ? 'rounded-control px-3 py-2' : presentation === 'tiles' ? 'h-full min-h-control gap-3 rounded-control p-3 text-ink group-data-[selected]:text-brand @sm:min-h-24 @sm:flex-col @sm:justify-between @sm:gap-4 @sm:rounded-panel @sm:p-4' : 'rounded-panel min-h-20 p-4'}`}
            >
              {option.preview ? (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none block min-w-0 ${comparison ? 'w-20 shrink-0 @sm:w-full' : 'w-full'}`}
                >
                  {option.preview}
                </span>
              ) : null}
              {compact && option.icon ? (
                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
                  {option.icon}
                </span>
              ) : null}
              {presentation === 'tiles' ? (
                option.icon ? (
                  <span
                    aria-hidden="true"
                    className="grid size-5 shrink-0 place-items-center text-current"
                  >
                    {option.icon}
                  </span>
                ) : null
              ) : !comparison && !(compact && option.icon) ? (
                <Radio.Control className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border-strong bg-surface group-data-[selected]:border-brand">
                  <Radio.Indicator className="pointer-events-none">
                    {/* 项目单选 dot：几何固定 10×10；仅 selected 时可见（group 根 data-selected）。
                    非空子节点避免 vendor `.radio__indicator:empty::before` 的默认 dot。 */}
                    <span
                      aria-hidden="true"
                      className="block size-2.5 rounded-full bg-brand opacity-0 transition-opacity group-data-[selected]:opacity-100"
                    />
                  </Radio.Indicator>
                </Radio.Control>
              ) : null}
              <span
                className={`flex min-w-0 flex-col items-start ${comparison || presentation === 'tiles' ? 'flex-1 @sm:w-full' : ''}`}
              >
                <span
                  className={`block max-w-full wrap-break-word font-semibold ${presentation === 'tiles' || comparison ? 'text-current' : compact && option.icon ? 'text-ink group-data-[selected]:text-brand' : 'text-ink'}`}
                >
                  {option.label}
                </span>
                {option.description ? (
                  <span
                    id={`${descriptionId}-${index}`}
                    className="mt-1 block text-xs leading-5 text-ink-muted"
                  >
                    {option.description}
                  </span>
                ) : null}
              </span>
            </Radio.Content>
          </Radio>
        ))}
      </div>
      {error ? (
        <FieldError className="ui-field-error">{error}</FieldError>
      ) : hint && !hintFirst ? (
        <Description className="ui-field-hint">{hint}</Description>
      ) : null}
    </RadioGroup>
  );
}

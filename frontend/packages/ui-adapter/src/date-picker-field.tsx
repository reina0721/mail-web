import { lazy, Suspense } from 'react';
import { Skeleton } from './skeleton';
const DatePickerCalendar = lazy(() => import('./date-picker-calendar'));
import { DateField } from '@heroui/react/date-field';
import { DatePicker } from '@heroui/react/date-picker';
import { Description } from '@heroui/react/description';
import { Label } from '@heroui/react/label';
import { parseDate } from '@internationalized/date';

export type DatePickerFieldProps = Readonly<{
  label: string;
  hint?: string;
  calendarLabel: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  /** ISO Gregorian calendar date (YYYY-MM-DD); null clears a controlled field. */
  value?: string | null;
  onValueChange?: (value: string | null) => void;
}>;

export function DatePickerField({
  label,
  hint,
  calendarLabel,
  disabled = false,
  defaultOpen = false,
  value,
  onValueChange,
}: DatePickerFieldProps) {
  return (
    <DatePicker
      className="ui-field"
      defaultOpen={defaultOpen}
      isDisabled={disabled}
      {...(value === undefined ? {} : { value: value === null ? null : parseDate(value) })}
      onChange={(value) => onValueChange?.(value?.toString() ?? null)}
    >
      <Label className="ui-field-label">{label}</Label>
      <DateField.Group className="ui-field-control flex items-center">
        <DateField.Input className="min-w-0 flex-1">
          {(segment) => (
            <DateField.Segment
              className="rounded px-0.5 outline-none data-[focused]:bg-brand-soft data-[focused]:text-brand"
              segment={segment}
            />
          )}
        </DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger className="grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-muted">
            <DatePicker.TriggerIndicator className="size-4" />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      {hint ? <Description className="ui-field-hint">{hint}</Description> : null}
      <DatePicker.Popover className="ui-overlay-surface p-3">
        <Suspense
          fallback={
            <div role="region" aria-label={calendarLabel} aria-busy="true" className="w-64">
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <DatePickerCalendar calendarLabel={calendarLabel} />
        </Suspense>
      </DatePicker.Popover>
    </DatePicker>
  );
}

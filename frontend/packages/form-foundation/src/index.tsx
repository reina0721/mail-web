/* Library entry同时导出 Hook 与组件，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */
import {
  Controller,
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type PathValue,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form';
import { useEffect, useRef, type FormEventHandler, type ReactNode, type Ref } from 'react';

import type { FoundationSchema } from '@community-go/schemas';

export type FormLifecycle = 'pristine' | 'dirty' | 'submitting' | 'submitted' | 'invalid';

export type RegisteredField = Readonly<{
  name: string;
  disabled?: boolean;
  onBlur: (event: unknown) => void;
  onChange: (event: unknown) => void;
  ref: (instance: unknown) => void;
}>;

export type ControlledField<Value> = Readonly<{
  name: string;
  value: Value;
  disabled?: boolean;
  onBlur: () => void;
  onChange: (value: Value) => void;
  ref: Ref<unknown>;
}>;

export type FoundationFormController<Values extends FieldValues> = Readonly<{
  interaction: 'editable' | 'readonly' | 'disabled';
  lifecycle: FormLifecycle;
  isDirty: boolean;
  isSubmitting: boolean;
  isSubmitted: boolean;
  isValid: boolean;
  registerField: (name: Path<Values>) => RegisteredField;
  hasError: (name: Path<Values>) => boolean;
  submit: (handler: (values: Values) => void | Promise<void>) => FormEventHandler<HTMLFormElement>;
  reset: (values?: Values) => void;
  setValue: <Name extends Path<Values>>(
    name: Name,
    value: PathValue<Values, Name>,
    options?: Readonly<{ dirty?: boolean; validate?: boolean }>,
  ) => void;
}>;

const formInternals = new WeakMap<object, UseFormReturn<FieldValues>>();

export function useFoundationForm<Values extends FieldValues>({
  schema,
  defaultValues,
  interaction = 'editable',
  focusFirstError = true,
}: Readonly<{
  schema: FoundationSchema<Values> | (() => Promise<FoundationSchema<Values>>);
  defaultValues: Values;
  interaction?: 'editable' | 'readonly' | 'disabled';
  /** 校验失败后是否自动定位首个错误字段（settings 操作偏好 focusFirstError，默认开）。 */
  focusFirstError?: boolean;
}>): FoundationFormController<Values> {
  const submitInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const resolver: Resolver<Values> = async (values, context, options) => {
    const [{ zodResolver }, resolvedSchema] = await Promise.all([
      import('@hookform/resolvers/zod'),
      typeof schema === 'function' ? schema() : Promise.resolve(schema),
    ]);
    return zodResolver(resolvedSchema)(values, context, options);
  };
  const form = useForm<Values>({
    defaultValues: defaultValues as DefaultValues<Values>,
    disabled: interaction === 'disabled',
    resolver,
    shouldFocusError: focusFirstError,
  });
  const { isDirty, isSubmitting, isSubmitted, isValid, errors } = form.formState;
  const lifecycle: FormLifecycle = isSubmitting
    ? 'submitting'
    : Object.keys(errors).length > 0
      ? 'invalid'
      : isSubmitted
        ? 'submitted'
        : isDirty
          ? 'dirty'
          : 'pristine';

  const controller: FoundationFormController<Values> = {
    interaction,
    lifecycle,
    isDirty,
    isSubmitting,
    isSubmitted,
    isValid,
    registerField: (name) => {
      const field = form.register(name);
      return {
        name: field.name,
        ...(interaction === 'disabled' ? { disabled: true } : {}),
        onBlur: (event) => void field.onBlur(event as Parameters<typeof field.onBlur>[0]),
        onChange: (event) => void field.onChange(event as Parameters<typeof field.onChange>[0]),
        ref: (instance) => field.ref(instance),
      };
    },
    hasError: (name) => Boolean(form.getFieldState(name).error),
    submit: (handler) => (event) => {
      event.preventDefault();
      if (submitInFlight.current) return;
      submitInFlight.current = true;
      void form
        .handleSubmit((values) => {
          if (mounted.current) return handler(values);
        })(event)
        .finally(() => {
          submitInFlight.current = false;
        });
    },
    reset: (values) => form.reset(values),
    setValue: (name, value, options) =>
      form.setValue(name, value, {
        shouldDirty: options?.dirty ?? true,
        shouldValidate: options?.validate ?? false,
      }),
  };

  formInternals.set(controller, form as unknown as UseFormReturn<FieldValues>);
  return controller;
}

export type LeaveConfirmationPort = Readonly<{
  confirmLeave: (message: string) => Promise<boolean>;
}>;

export async function requestFoundationFormLeave<Values extends FieldValues>({
  form,
  port,
  message,
}: Readonly<{
  form: FoundationFormController<Values>;
  port: LeaveConfirmationPort;
  message: string;
}>): Promise<boolean> {
  return form.isDirty ? port.confirmLeave(message) : true;
}

/** FoundationForm 统一 submit 与原生 form 语义，Feature 只提供业务处理函数。 */
export function FoundationForm<Values extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
}: Readonly<{
  form: FoundationFormController<Values>;
  onSubmit: (values: Values) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <form
      className={className}
      noValidate
      onSubmit={form.submit(onSubmit)}
      aria-busy={form.isSubmitting || undefined}
    >
      {children}
    </form>
  );
}

export function FoundationControlledField<Values extends FieldValues, Name extends Path<Values>>({
  form,
  name,
  children,
}: Readonly<{
  form: FoundationFormController<Values>;
  name: Name;
  children: (field: ControlledField<PathValue<Values, Name>>) => ReactNode;
}>) {
  const internal = formInternals.get(form);
  if (!internal) throw new Error('Foundation form controller is not active.');

  return (
    <Controller
      control={internal.control}
      name={name}
      render={({ field }) => (
        <>
          {children({
            name: field.name,
            value: field.value,
            ...(field.disabled === undefined ? {} : { disabled: field.disabled }),
            onBlur: field.onBlur,
            onChange: field.onChange,
            ref: field.ref,
          })}
        </>
      )}
    />
  );
}

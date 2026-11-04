export type FieldTextProps = Readonly<{
  label: string;
  hint?: string;
  error?: string;
}>;

export type FieldValueProps =
  | Readonly<{ value: string; defaultValue?: never }>
  | Readonly<{ value?: never; defaultValue?: string }>;

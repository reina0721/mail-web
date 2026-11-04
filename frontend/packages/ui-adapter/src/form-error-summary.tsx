export type FormErrorSummaryItem = Readonly<{
  fieldId: string;
  message: string;
  label?: string;
  onFocus?: () => void;
}>;

export type FormErrorSummaryProps = Readonly<{
  title: string;
  errors: readonly FormErrorSummaryItem[];
}>;

/** FormErrorSummary 汇总提交错误，并允许把焦点恢复到对应字段。 */
export function FormErrorSummary({ title, errors }: FormErrorSummaryProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="foundation-form-error-summary-title"
      className="rounded-panel border border-danger/30 bg-danger-soft p-4 text-danger"
      role="alert"
      tabIndex={-1}
    >
      <h2 className="text-sm font-bold" id="foundation-form-error-summary-title">
        {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
        {errors.map((error) => (
          <li key={error.fieldId}>
            {error.onFocus ? (
              <button
                className="rounded-sm text-start underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={error.onFocus}
                type="button"
              >
                {error.label ? `${error.label}：${error.message}` : error.message}
              </button>
            ) : (
              <a
                className="rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                href={`#${error.fieldId}`}
              >
                {error.label ? `${error.label}：${error.message}` : error.message}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

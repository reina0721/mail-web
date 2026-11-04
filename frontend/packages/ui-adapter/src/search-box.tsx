import { SearchField } from '@heroui/react/search-field';

export type SearchBoxProps = Readonly<{
  label: string;
  placeholder: string;
  value?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}>;

export function SearchBox({
  label,
  placeholder,
  value,
  disabled = false,
  onValueChange,
}: SearchBoxProps) {
  return (
    <SearchField
      aria-label={label}
      className="min-w-0 w-full"
      isDisabled={disabled}
      {...(value !== undefined ? { value } : {})}
      {...(onValueChange ? { onChange: onValueChange } : {})}
    >
      <SearchField.Group className="flex min-w-0 min-h-control items-center gap-2 rounded-control border border-border bg-surface px-3.5 shadow-sm data-[focus-within]:border-brand">
        <SearchField.SearchIcon className="size-4 shrink-0 text-ink-muted" />
        <SearchField.Input
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted/70"
          placeholder={placeholder}
        />
        <SearchField.ClearButton className="grid size-7 place-items-center rounded-control text-ink-muted hover:bg-surface-muted" />
      </SearchField.Group>
    </SearchField>
  );
}

import { tv } from '@heroui/styles';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup as HeroToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { useId, type ReactNode } from 'react';
import { useCollectionViewport } from './browser-layout';

export type ToggleGroupOption = Readonly<{
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}>;

export type ToggleGroupProps = Readonly<{
  label: string;
  description?: string;
  options: readonly ToggleGroupOption[];
  selectedIds: readonly string[];
  onSelectionChange: (selectedIds: readonly string[]) => void;
  selectionMode?: 'single' | 'multiple';
  size?: 'sm' | 'md';
  disabled?: boolean;
}>;

const toggleStyles = tv({
  base: 'rounded-control border font-semibold text-ink-muted outline-none transition-colors',
  defaultVariants: { size: 'md' },
  variants: {
    size: {
      md: 'min-h-control gap-2 px-3.5 text-sm',
      sm: 'min-h-control-sm gap-1.5 px-3 text-sm',
    },
  },
});

/**
 * item 几何按 selectionMode：
 * - single：连体 segmented —— 无独立可见 border（用 transparent 占位防跳动），
 *   selected 靠 brand-soft surface + 文字表达；border 保持 transparent。
 * - multiple：独立 toggle items —— 每个 item 完整 border + semantic radius，
 *   hover/selected/focus-visible 都在自身 control boundary 内；group 只负责排列与 gap。
 */
const itemBorderByMode = {
  single:
    'border-transparent hover:bg-surface data-[selected]:border-brand/25 data-[selected]:bg-brand-soft data-[selected]:text-brand',
  multiple:
    'border-border hover:bg-surface-muted data-[selected]:border-brand/40 data-[selected]:bg-brand-soft data-[selected]:text-brand',
} as const;

/**
 * multiple（independent toggle items）的容器：退出 vendor attached/segmented 几何——
 * items 之间用稳定 semantic gap；每个 item 独立拥有 surface/border/radius，
 * hover/selected/focus-visible 在自身 control boundary 内表达；group 只负责排列与 gap。
 * single（coherent segmented）不加 gap，保持连续 segmented composition。
 */
const groupContainerClass = {
  single:
    'inline-flex min-w-0 max-w-full overflow-x-auto rounded-panel border border-border bg-surface-muted p-1',
  multiple:
    'inline-flex min-w-0 max-w-full flex-wrap items-stretch gap-1 rounded-panel border border-border bg-surface-muted p-1',
} as const;

export function ToggleGroup({
  label,
  description,
  options,
  selectedIds,
  onSelectionChange,
  selectionMode = 'single',
  size = 'md',
  disabled = false,
}: ToggleGroupProps) {
  const labelId = useId();
  const descriptionId = useId();
  const { ref, overflow } = useCollectionViewport(
    selectedIds.join('|'),
    options.map((option) => [option.id, option.label, option.disabled].join(':')).join('|'),
    '[aria-checked="true"], [aria-pressed="true"]',
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <span className="text-sm font-semibold text-ink" id={labelId}>
        {label}
      </span>
      {description ? (
        <span className="text-xs leading-5 text-ink-muted" id={descriptionId}>
          {description}
        </span>
      ) : null}
      <HeroToggleButtonGroup
        ref={ref}
        aria-labelledby={labelId}
        className={groupContainerClass[selectionMode]}
        isDisabled={disabled}
        onSelectionChange={(keys) => onSelectionChange([...keys].map(String))}
        selectedKeys={new Set(selectedIds)}
        selectionMode={selectionMode}
        {...(description ? { 'aria-describedby': descriptionId } : {})}
      >
        {options.map((option) => (
          <ToggleButton
            className={`${toggleStyles({ size })} ${itemBorderByMode[selectionMode]} ${selectionMode === 'single' ? 'shrink-0 whitespace-nowrap' : ''}`}
            id={option.id}
            key={option.id}
            variant="ghost"
            {...(option.disabled !== undefined ? { isDisabled: option.disabled } : {})}
          >
            {option.icon ? (
              <span
                aria-hidden="true"
                className="grid size-icon-sm shrink-0 place-items-center text-current [&>svg]:m-0"
              >
                {option.icon}
              </span>
            ) : null}
            <span>{option.label}</span>
          </ToggleButton>
        ))}
      </HeroToggleButtonGroup>
      {overflow.before || overflow.after ? (
        <span aria-hidden="true" className="text-end text-xs text-ink-muted">
          {overflow.before ? '‹ ' : ''}
          {overflow.after ? ' ›' : ''}
        </span>
      ) : null}
    </div>
  );
}

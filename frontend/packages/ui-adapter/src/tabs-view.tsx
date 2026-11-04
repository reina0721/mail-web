import { Tabs } from '@heroui/react/tabs';
import { startTransition, useState, type ReactNode } from 'react';
import { ContentSwapTransition } from './content-swap-transition';
import { Badge } from './feedback';
import { useCollectionViewport, useNarrowLayout } from './browser-layout';

export type TabsViewItem = Readonly<{
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
  /** 受控 leading icon；wrapper 的尺寸、颜色继承与 aria-hidden 由 TabsView 负责。 */
  icon?: ReactNode;
  /** 受控 count/短元数据；由 TabsView 用 Badge primitive 统一渲染。 */
  badge?: number | string;
}>;

/**
 * TabsView 的稳定语义 Variant（仅表达「同一内容域中的内容切换」语义）。
 *
 * Visual Variant：
 * - `line`（默认）：普通内容导航。TabList 透明、无独立 Surface、无胶囊；
 *   底部允许一条非常轻的 baseline；selected 用 brand foreground + 底部 brand indicator。
 * - `section`：Card / Form / Settings / Panel 内部章节导航。视觉语言与 line 一致
 *   （透明 TabList、不创建灰色 Toolbar、不拥有独立 rounded Surface、不强制整条
 *   baseline），spacing 更适合嵌入已有 Surface；内容分隔由父容器决定。
 * - `soft`：希望 TabList 自身形成轻量选择区域。TabList 用非常轻的 semantic muted
 *   surface + 受控小圆角 + 紧凑 padding；selected Tab 用独立 elevated/default surface
 *   凸显；不使用 line underline、不做夸张胶囊。语义仍是内容切换，不是值/模式选择
 *   （后者用 ToggleGroup）。
 *
 * Orientation：`horizontal`（默认）| `vertical`。Vertical 不创建新业务 Variant，
 * 只改变 indicator/布局表达；窄 viewport 自动回退为顶部横向可滚动 TabList。
 *
 * 视觉职责边界：本组件是 Tabs 最终视觉的所有者（background/foreground/border/
 * indicator/radius/spacing/shadow/focus/hover/selected 均通过 semantic token 表达），
 * 不向业务暴露 HeroUI visual variant，也不提供可覆盖 TabList 视觉的通用 className
 * 逃生口；长期布局需求通过受控 semantic props 扩展。
 */
export type TabsViewVariant = 'line' | 'section' | 'soft';
export type TabsViewOrientation = 'horizontal' | 'vertical';

export type TabsViewProps = Readonly<{
  label: string;
  items: readonly TabsViewItem[];
  selectedId?: string;
  onSelectionChange?: (id: string) => void;
  variant?: TabsViewVariant;
  orientation?: TabsViewOrientation;
}>;

/** Tab 通用基类：清除 HeroUI 胶囊残留（h-8），由 padding/行高表达高度；圆角由 variant 决定。 */
const tabBaseClass =
  'w-auto shrink-0 whitespace-nowrap text-sm font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-50';

/** horizontal 布局的 Tab：统一内边距与内容行（icon/badge 不改变 Tab 高度）。 */
const tabHContentClass = 'inline-flex min-h-10 items-center justify-center gap-1.5 px-3';

/**
 * variant × orientation 的选中/指示表达（用户确认的固定矩阵）：
 * - horizontal line     → bottom indicator（含轻 baseline）
 * - horizontal section  → bottom indicator，无整条 baseline（baseline 由父容器决定）
 * - horizontal soft     → selected surface（elevated default surface，无 underline）
 * - vertical line       → side indicator + foreground，无 selected surface
 * - vertical section    → side indicator + foreground，无 selected surface
 * - vertical soft       → selected surface
 */

const tabListLayoutH = 'flex min-w-0 flex-row w-full max-w-full items-center gap-1 overflow-x-auto';
/**
 * vertical 的 TabList：窄视口（< md）表现为顶部横向可滚动行；
 * md 及以上表现为左侧纵向列（固定宽度），内容在右。
 */
const tabListLayoutV =
  'flex min-w-0 flex-row w-full max-w-full items-center gap-1 overflow-x-auto md:w-48 md:shrink-0 md:flex-col md:items-stretch md:overflow-visible';

/**
 * variant × orientation 的 TabList 容器 class：
 * - horizontal：line 带轻 baseline；section 无整条 baseline；soft 用 muted surface 容器。
 * - vertical：narrow=横向滚动行、wide=纵向列；line/section 无容器表面，soft 保留 muted 容器。
 */
function buildTabListClass(variant: TabsViewVariant, orientation: TabsViewOrientation): string {
  const layout = orientation === 'vertical' ? tabListLayoutV : tabListLayoutH;
  const baseline =
    orientation === 'horizontal' && variant === 'line' ? 'border-b border-border' : '';
  const container = variant === 'soft' ? 'rounded-panel bg-surface-muted p-1' : '';
  return [layout, baseline, container].filter(Boolean).join(' ');
}

/**
 * variant × orientation 的 Tab class（用户确认的固定矩阵）：
 * - horizontal：line/section 用 bottom indicator（border-b-2 brand）；
 *   soft 用 selected surface，无 underline。
 * - vertical：line/section 用 side indicator（border-s-2 brand）+ foreground，
 *   无 selected surface；soft 用 selected surface。
 */
function buildTabClass(variant: TabsViewVariant, orientation: TabsViewOrientation): string {
  if (variant === 'soft') {
    // muted 容器内：idle 无圆角融入容器；selected 用 elevated surface（data 变体优先级更高）。
    const selectedSurface =
      'rounded-none bg-transparent text-ink-muted data-[selected]:rounded-control data-[selected]:bg-surface data-[selected]:text-ink data-[selected]:font-semibold data-[selected]:shadow-sm data-[selected]:border data-[selected]:border-border/70';
    const idle = 'hover:text-ink hover:bg-surface-muted';
    return `${tabBaseClass} ${tabHContentClass} ${selectedSurface} ${idle}`;
  }
  // line / section（无胶囊圆角：覆盖 HeroUI .tabs__tab 的 rounded-3xl）
  const idle = 'text-ink-muted hover:text-ink hover:bg-surface-muted/60';
  const noPill = 'rounded-none';
  if (orientation === 'vertical') {
    // md+ 纵向列：side indicator（border-s brand）；窄视口退化为行时保持 foreground 强调。
    return `${tabBaseClass} ${tabHContentClass} ${noPill} w-auto shrink-0 justify-start text-start ${idle} border-s-2 border-transparent data-[selected]:border-brand data-[selected]:text-brand data-[selected]:font-semibold md:w-full`;
  }
  // horizontal bottom indicator
  return `${tabBaseClass} ${tabHContentClass} ${noPill} -mb-px ${idle} border-b-2 border-transparent data-[selected]:border-brand data-[selected]:text-brand data-[selected]:font-semibold`;
}

export function TabsView({
  label,
  items,
  selectedId,
  onSelectionChange,
  variant = 'line',
  orientation = 'horizontal',
}: TabsViewProps) {
  const narrow = useNarrowLayout();
  const resolvedOrientation = orientation === 'vertical' && narrow ? 'horizontal' : orientation;
  const firstEnabledId = items.find((item) => !item.disabled)?.id ?? '';
  const [internalSelectedId, setInternalSelectedId] = useState(firstEnabledId);
  const candidate = selectedId ?? internalSelectedId;
  const resolvedSelectedId =
    items.find((item) => item.id === candidate && !item.disabled)?.id ??
    items.find((item) => !item.disabled)?.id ??
    '';
  const [selectionEntry, setSelectionEntry] = useState({
    id: resolvedSelectedId,
    changed: false,
  });
  if (selectionEntry.id !== resolvedSelectedId)
    setSelectionEntry({ id: resolvedSelectedId, changed: true });
  const listClass = buildTabListClass(variant, resolvedOrientation);
  const tabClass = buildTabClass(variant, resolvedOrientation);
  const isVertical = resolvedOrientation === 'vertical';
  const contentSignature = items
    .map((item) => [item.id, item.label, item.badge, item.disabled].join(':'))
    .join('|');
  const { ref: viewportRef, overflow } = useCollectionViewport(
    resolvedSelectedId,
    contentSignature,
  );

  return (
    <Tabs
      className={
        isVertical ? 'flex w-full flex-col gap-4 md:flex-row md:items-start' : 'min-w-0 w-full'
      }
      disabledKeys={items.filter((item) => item.disabled).map((item) => item.id)}
      keyboardActivation="automatic"
      onSelectionChange={(key) => {
        const nextId = String(key);
        startTransition(() => {
          if (selectedId === undefined) setInternalSelectedId(nextId);
          onSelectionChange?.(nextId);
        });
      }}
      orientation={resolvedOrientation}
      selectedKey={resolvedSelectedId}
    >
      <Tabs.List ref={viewportRef} aria-label={label} className={listClass}>
        {items.map((item) => (
          <Tabs.Tab className={tabClass} id={item.id} key={item.id}>
            {item.icon ? (
              <span
                aria-hidden="true"
                className="grid size-icon-sm shrink-0 place-items-center text-current"
              >
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
            {item.badge !== undefined ? (
              <Badge appearance="soft" size="sm" tone="neutral">
                {String(item.badge)}
              </Badge>
            ) : null}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {overflow.before || overflow.after ? (
        <span aria-hidden="true" className="text-end text-xs text-ink-muted">
          {overflow.before ? '‹ ' : ''}
          {overflow.after ? ' ›' : ''}
        </span>
      ) : null}
      {items.map((item) => (
        <Tabs.Panel
          className={`mt-3 outline-none ${isVertical ? 'min-w-0 flex-1' : ''}`}
          id={item.id}
          key={item.id}
        >
          <ContentSwapTransition
            contentKey={resolvedSelectedId}
            initialChange={selectionEntry.changed}
          >
            {item.content}
          </ContentSwapTransition>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

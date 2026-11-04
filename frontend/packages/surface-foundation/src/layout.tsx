import { BreadcrumbTrail } from '@community-go/ui-adapter/navigation';
import { Panel } from '@community-go/ui-adapter/panel';
import type { ReactNode } from 'react';
import { ViewportReveal } from './viewport-reveal';

export function Page({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ViewportReveal items className="surface-page-stack">
      {children}
    </ViewportReveal>
  );
}

export type BreadcrumbItem = Readonly<{
  label: string;
  current?: boolean;
  content?: ReactNode;
}>;

export type PageHeaderProps = Readonly<{
  eyebrow?: string;
  title: string;
  description: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  breadcrumbLabel?: string;
  actions?: ReactNode;
}>;

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  breadcrumbLabel,
  actions,
}: PageHeaderProps) {
  return (
    <header data-reveal-item className="surface-route-region space-y-4">
      {breadcrumbs && breadcrumbLabel ? (
        <BreadcrumbTrail
          items={breadcrumbs.map((item, index) => ({
            id: `breadcrumb-${index}`,
            label: item.label,
            ...(item.content && !item.current ? { content: item.content } : {}),
          }))}
          label={breadcrumbLabel}
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <p className="text-xs font-bold uppercase tracking-widest text-brand">{eyebrow}</p>
          ) : null}
          <h1
            className={`${eyebrow ? 'mt-3' : ''} text-balance text-3xl font-extrabold tracking-tight text-ink sm:text-4xl`}
          >
            {title}
          </h1>
          <p className="mt-3 text-sm leading-7 text-ink-muted sm:text-base">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Toolbar({
  label,
  primary,
  secondary,
}: Readonly<{ label: string; primary: ReactNode; secondary?: ReactNode }>) {
  return (
    <div
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface p-3 shadow-sm"
      role="toolbar"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{primary}</div>
      {secondary ? <div className="flex flex-wrap items-center gap-2">{secondary}</div> : null}
    </div>
  );
}

export function FilterBar({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="surface-filter-grid rounded-panel bg-surface-muted p-3">{children}</div>;
}

/**
 * SectionBody —— Panel/Section 内容区 body 的统一 horizontal inset。
 *
 * 组合职责：section 场景（如 `TabsView variant="section"` 作章节导航 + 内容）需要
 * TabList 与内容共享父容器左右内容边界、并具备稳定上下间距。此 wrapper 只提供
 * 统一 inset，不创建 Surface/divider（由父 Panel/Section 决定区域分隔）。
 * 供 Section（contentInset）与自定义 header 的 Panel body 复用，
 * 避免各调用方手写 px/py。
 */
export function SectionBody({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="px-5 py-5 sm:px-6">{children}</div>;
}

export type SectionProps = Readonly<{
  id?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  appearance?: 'elevated' | 'outlined' | 'embedded';
  /**
   * true 时 children 包进 SectionBody（统一 horizontal inset + 稳定上下间距），
   * 供需要“章节导航 + 内容共享父容器内容边界”的组合（如 `TabsView variant="section"`）。
   * 默认 false 保持既有 flush children 行为（不影响现有调用方）。
   */
  contentInset?: boolean;
}>;

export function Section({
  id,
  title,
  description,
  action,
  children,
  appearance = 'elevated',
  contentInset = false,
}: SectionProps) {
  const section = (
    <Panel appearance={appearance} className="surface-route-region overflow-hidden">
      <div
        data-reveal-item
        className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4"
      >
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div data-reveal-item>{contentInset ? <SectionBody>{children}</SectionBody> : children}</div>
    </Panel>
  );

  return id ? (
    <div className="surface-route-region scroll-mt-24" id={id}>
      {section}
    </div>
  ) : (
    section
  );
}

export function SplitView({ master, detail }: Readonly<{ master: ReactNode; detail: ReactNode }>) {
  return (
    <div className="surface-split-view">
      <div className="min-w-0">{master}</div>
      <aside className="surface-split-detail">{detail}</aside>
    </div>
  );
}

export function StickyActions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <footer className="sticky bottom-3 z-shell flex flex-wrap items-center justify-end gap-3 rounded-panel border border-border bg-surface/95 px-4 py-3 shadow-overlay backdrop-blur-xl">
      {children}
    </footer>
  );
}

'use client';

import { flattenNavigationLeaves, isNavigationHrefActive } from '@community-go/core';
import type {
  NavigationBranch,
  NavigationGroup,
  NavigationLeaf,
  NavigationNode,
} from '@community-go/types';
import { NavigationFlyout, NavigationHint } from '@community-go/ui-adapter/navigation-flyout';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  accordionRootScope,
  carryAccordionModel,
  effectiveExplorationOf,
  emptyAccordionModel,
  isBranchExpanded,
  reduceNavigationAccordion,
  resetAccordionModel,
  type AccordionExploration,
  type AccordionModel,
} from './shell-navigation-accordion';

export type NavigationLink = Readonly<{
  href: string;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
  title?: string;
  current?: boolean;
  onNavigate?: () => void;
}>;

export type RouterPort = Readonly<{
  currentPath: string;
  renderLink: (link: NavigationLink) => ReactNode;
}>;

export type NavigationPresenter = Readonly<{
  translate: (key: string, values?: Readonly<Record<string, unknown>>) => string;
  /** Shell 侧按 node.iconId 决定图标；foundation 只转发 opaque presentation metadata。 */
  icon: (iconId: string | undefined, active: boolean) => ReactNode;
}>;

type TreeNodeProps = Readonly<{
  node: NavigationNode;
  activeLeafId?: string | undefined;
  activeAncestorIds: ReadonlySet<string>;
  /** 当前节点所属 Accordion scopeKey：顶层 'root'，branch 子级 = 该 branch navigationId。 */
  scopeKey: string;
  /** routeKey 门控后的有效 exploration（渲染判定只用它）。 */
  exploration: AccordionExploration;
  presenter: NavigationPresenter;
  router: RouterPort;
  onToggle: (branch: NavigationBranch, scopeKey: string, currentlyExpanded: boolean) => void;
  onNavigate?: (() => void) | undefined;
}>;

function ExpandedNode({
  node,
  activeLeafId,
  activeAncestorIds,
  scopeKey,
  exploration,
  presenter,
  router,
  onToggle,
  onNavigate,
}: TreeNodeProps) {
  const active = node.kind === 'leaf' ? node.id === activeLeafId : activeAncestorIds.has(node.id);
  const linkClassName = `ui-navigation-focus group flex min-h-10 items-center gap-3 rounded-control ${scopeKey === accordionRootScope ? 'surface-shell-navigation-root-item' : 'px-3'} py-2 text-sm font-semibold transition-colors active:bg-surface-inset ${
    active ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
  }`;

  if (node.kind === 'leaf') {
    return (
      <li>
        {router.renderLink({
          href: node.href,
          current: active,
          className: linkClassName,
          children: (
            <>
              <span
                aria-hidden="true"
                className="flex size-icon-sm shrink-0 items-center justify-center"
              >
                {presenter.icon(node.iconId, active)}
              </span>
              <span className="min-w-0 flex-1 truncate">{presenter.translate(node.labelKey)}</span>
            </>
          ),
          ...(onNavigate ? { onNavigate } : {}),
        })}
      </li>
    );
  }

  const isActiveAncestor = activeAncestorIds.has(node.id);
  const expanded = isBranchExpanded({
    branchId: node.id,
    scopeKey,
    isActiveAncestor,
    exploration,
  });
  const childrenId = `surface-navigation-${node.id}`;
  return (
    <li>
      <button
        aria-controls={childrenId}
        aria-expanded={expanded}
        aria-label={presenter.translate('shell.toggleNavigation', {
          label: presenter.translate(node.labelKey),
        })}
        className={`${linkClassName} w-full border-0 text-start`}
        onClick={() => onToggle(node, scopeKey, expanded)}
        type="button"
      >
        <span aria-hidden="true" className="flex size-icon-sm shrink-0 items-center justify-center">
          {presenter.icon(node.iconId, active)}
        </span>
        <span className="min-w-0 flex-1 truncate">{presenter.translate(node.labelKey)}</span>
        <svg
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 16 16"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {expanded ? (
        <ul className="ms-4 mt-1 space-y-1 border-s border-border ps-2" id={childrenId}>
          {node.children.map((child) => (
            <ExpandedNode
              activeAncestorIds={activeAncestorIds}
              activeLeafId={activeLeafId}
              exploration={exploration}
              key={child.id}
              node={child}
              onNavigate={onNavigate}
              onToggle={onToggle}
              presenter={presenter}
              router={router}
              scopeKey={node.id}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CompactLeaf({
  leaf,
  active,
  presenter,
  router,
  onNavigate,
}: Readonly<{
  leaf: NavigationLeaf;
  active: boolean;
  presenter: NavigationPresenter;
  router: RouterPort;
  onNavigate?: (() => void) | undefined;
}>) {
  const label = presenter.translate(leaf.labelKey);
  return (
    <NavigationHint label={label}>
      {router.renderLink({
        href: leaf.href,
        ariaLabel: label,
        current: active,
        className: `ui-navigation-icon-trigger ${active ? 'bg-brand-soft text-brand' : ''}`,
        children: (
          <span aria-hidden="true" className="ui-navigation-icon">
            {presenter.icon(leaf.iconId, active)}
          </span>
        ),
        ...(onNavigate ? { onNavigate } : {}),
      })}
    </NavigationHint>
  );
}

function CompactBranch({
  branch,
  active,
  activeLeafId,
  activeAncestorIds,
  exploration,
  presenter,
  router,
  isOpen,
  onOpenChange,
  onToggle,
  onNavigate,
}: Readonly<{
  branch: NavigationBranch;
  active: boolean;
  activeLeafId?: string | undefined;
  activeAncestorIds: ReadonlySet<string>;
  /** routeKey 门控后的有效 exploration（Flyout 内嵌套 branch 的展开判定）。 */
  exploration: AccordionExploration;
  presenter: NavigationPresenter;
  router: RouterPort;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (branch: NavigationBranch, scopeKey: string, currentlyExpanded: boolean) => void;
  onNavigate?: (() => void) | undefined;
}>) {
  return (
    <NavigationFlyout
      active={active}
      icon={presenter.icon(branch.iconId, active)}
      isOpen={isOpen}
      label={presenter.translate(branch.labelKey)}
      onOpenChange={onOpenChange}
    >
      <ul className="space-y-1">
        {branch.children.map((child) => (
          <ExpandedNode
            activeAncestorIds={activeAncestorIds}
            activeLeafId={activeLeafId}
            exploration={exploration}
            key={child.id}
            node={child}
            onNavigate={() => {
              onOpenChange(false);
              onNavigate?.();
            }}
            onToggle={onToggle}
            presenter={presenter}
            router={router}
            scopeKey={branch.id}
          />
        ))}
      </ul>
    </NavigationFlyout>
  );
}

/** 收集所有 branch navigationId -> 其子树全部 branch navigationId（含自身）。 */
function collectDescendantBranchIds(nodes: readonly NavigationNode[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const collectSubtree = (items: readonly NavigationNode[], into: string[]): void => {
    for (const item of items) {
      if (item.kind === 'branch') {
        into.push(item.id);
        collectSubtree(item.children, into);
      }
    }
  };
  const visit = (items: readonly NavigationNode[]): void => {
    for (const item of items) {
      if (item.kind === 'branch') {
        const subtree: string[] = [];
        collectSubtree(item.children, subtree);
        index.set(item.id, [item.id, ...subtree]);
        visit(item.children);
      }
    }
  };
  visit(nodes);
  return index;
}

/** ShellNavigation 只消费 Router Port，不感知 Next、History 或 Desktop Runtime。 */
export function ShellNavigation({
  groups,
  router,
  presenter,
  compact = false,
  onNavigate,
  menuMemory = false,
}: Readonly<{
  groups: readonly NavigationGroup[];
  router: RouterPort;
  presenter: NavigationPresenter;
  compact?: boolean;
  onNavigate?: (() => void) | undefined;
  /**
   * 跨导航记忆侧栏展开菜单（settings 导航 → menuMemory，默认关）。
   * 开：手动展开的 exploration 跨 Route 保留（active 祖先仍锚定展开、同 scope
   * 至多一个 exploration 约束不变）；关（默认）：Route Commit 后清空（现行行为）。
   */
  menuMemory?: boolean;
}>) {
  const [accordion, setAccordion] = useState<AccordionModel>(() =>
    emptyAccordionModel(router.currentPath),
  );
  // Compact 模式同一时刻只允许一个父级 Flyout 打开：兄弟切换时立即替换，
  // 旧 Flyout 的延迟关闭回调只能关闭自身，不能误关新菜单。
  // openBranchId = Compact Flyout disclosure；exploration = Expanded Tree accordion exploration。
  const [openBranchId, setOpenBranchId] = useState<string | null>(null);

  const paths = flattenNavigationLeaves(groups.flatMap((group) => group.items));
  const activePath = paths.find(({ leaf }) =>
    isNavigationHrefActive(leaf.href, router.currentPath),
  );
  const activeAncestorIds = new Set(activePath?.ancestors.map(({ id }) => id));

  const descendantBranchIds = useMemo(
    () => collectDescendantBranchIds(groups.flatMap((group) => group.items)),
    [groups],
  );

  // routeKey 门控：旧 Route 的 exploration 在新 Route 可见渲染中立即失效（不等 effect）。
  const effectiveExploration = effectiveExplorationOf(accordion, router.currentPath);

  // Route Commit 清理：functional reconciliation——只清仍属于旧 Route 世代的状态；
  // 若 reducer 已把 state 升级到新世代（含用户新 toggle 的 exploration），保留，不覆盖。
  const previousPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (previousPathRef.current === null) {
      previousPathRef.current = router.currentPath;
      return;
    }
    if (previousPathRef.current === router.currentPath) return;
    previousPathRef.current = router.currentPath;
    setAccordion((current) => {
      if (current.routeKey === router.currentPath) return current;
      // menuMemory=开：跨路由携带 exploration（推进 routeKey 保留展开）；
      // 关（默认）：Route Commit 清空 exploration（现行 Active Path 重算）。
      return menuMemory
        ? carryAccordionModel(current, router.currentPath)
        : resetAccordionModel(router.currentPath);
    });
  }, [router.currentPath, menuMemory]);

  const handleBranchToggle = (
    branch: NavigationBranch,
    scopeKey: string,
    currentlyExpanded: boolean,
  ) => {
    setAccordion((current) =>
      reduceNavigationAccordion(
        current,
        {
          branchId: branch.id,
          scopeKey,
          expand: !currentlyExpanded,
          routeKey: router.currentPath,
        },
        { activeBranchIds: activeAncestorIds, descendantBranchIds },
      ),
    );
  };

  return groups.map((group) => (
    <div
      key={group.id}
      className={compact ? 'surface-shell-compact-group w-control-lg' : undefined}
    >
      {compact ? null : (
        <p className="mb-2 px-3 text-xs font-bold uppercase tracking-widest text-ink-muted">
          {presenter.translate(group.labelKey)}
        </p>
      )}
      <ul className="space-y-1" aria-label={presenter.translate(group.labelKey)}>
        {group.items.map((node) => {
          const active =
            node.kind === 'leaf' ? node.id === activePath?.leaf.id : activeAncestorIds.has(node.id);
          if (compact) {
            return (
              <li key={node.id}>
                {node.kind === 'leaf' ? (
                  <CompactLeaf
                    active={active}
                    leaf={node}
                    onNavigate={onNavigate}
                    presenter={presenter}
                    router={router}
                  />
                ) : (
                  <CompactBranch
                    active={active}
                    activeAncestorIds={activeAncestorIds}
                    activeLeafId={activePath?.leaf.id}
                    branch={node}
                    exploration={effectiveExploration}
                    isOpen={openBranchId === node.id}
                    onNavigate={onNavigate}
                    onOpenChange={(open) =>
                      setOpenBranchId((current) =>
                        open ? node.id : current === node.id ? null : current,
                      )
                    }
                    onToggle={handleBranchToggle}
                    presenter={presenter}
                    router={router}
                  />
                )}
              </li>
            );
          }
          return (
            <ExpandedNode
              activeAncestorIds={activeAncestorIds}
              activeLeafId={activePath?.leaf.id}
              exploration={effectiveExploration}
              key={node.id}
              node={node}
              onNavigate={onNavigate}
              onToggle={handleBranchToggle}
              presenter={presenter}
              router={router}
              scopeKey={accordionRootScope}
            />
          );
        })}
      </ul>
    </div>
  ));
}

/** ShellRoot 拥有后台 Shell 的稳定布局，Host 只注入导航、平台操作和页面内容。 */
export function ShellRoot({
  children,
  collapsed = false,
}: Readonly<{ children: ReactNode; collapsed?: boolean }>) {
  return (
    <div
      className="surface-shell-grid min-h-screen bg-canvas text-ink"
      data-sidebar={collapsed ? 'collapsed' : 'expanded'}
    >
      {children}
    </div>
  );
}

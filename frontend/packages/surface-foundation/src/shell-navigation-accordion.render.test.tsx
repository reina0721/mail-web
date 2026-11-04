// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { NavigationBranch, NavigationGroup, NavigationLeaf } from '@community-go/types';

import { ShellNavigation, type NavigationPresenter, type RouterPort } from './shell-navigation';

// ---- 测试双 ---- //

function leaf(id: string, href: string): NavigationLeaf {
  return { kind: 'leaf', id, labelKey: `nav.${id}`, href };
}

function branch(
  id: string,
  children: readonly (NavigationBranch | NavigationLeaf)[],
): NavigationBranch {
  const firstLeaf = (nodes: readonly (NavigationBranch | NavigationLeaf)[]): NavigationLeaf =>
    nodes[0]!.kind === 'leaf'
      ? (nodes[0] as NavigationLeaf)
      : firstLeaf((nodes[0] as NavigationBranch).children);
  return {
    kind: 'branch',
    id,
    labelKey: `nav.${id}`,
    defaultHref: firstLeaf(children).href,
    children: children as [
      NavigationBranch | NavigationLeaf,
      ...(NavigationBranch | NavigationLeaf)[],
    ],
  };
}

function group(id: string, items: readonly (NavigationBranch | NavigationLeaf)[]): NavigationGroup {
  return {
    id,
    labelKey: `nav.group.${id}`,
    items: items as [NavigationBranch | NavigationLeaf, ...(NavigationBranch | NavigationLeaf)[]],
  };
}

/**
 * fixture：三个视觉 group（groupA/groupB/groupC），顶层 branch 共享 root Accordion scope。
 * - groupA -> A -> A1 -> leaf /a/a1（深层 active 链）
 * - groupB -> B -> B1 -> leaf /b/b1
 * - groupC -> C -> leaf /c
 */
const deepFixtureGroups: readonly NavigationGroup[] = [
  group('groupA', [branch('A', [branch('A1', [leaf('leafA', '/a/a1')]), leaf('leafA2', '/a/a2')])]),
  group('groupB', [branch('B', [branch('B1', [leaf('leafB', '/b/b1')])])]),
  group('groupC', [branch('C', [leaf('leafC', '/c')])]),
];

const testPresenter = (): NavigationPresenter => ({
  translate: (key, values) => {
    if (key === 'shell.toggleNavigation' && values && typeof values.label === 'string') {
      return `展开或收起${values.label}`;
    }
    return key.replace('nav.', '');
  },
  icon: () => null,
});

function renderNav(groups: readonly NavigationGroup[], currentPath: string, compact = false) {
  const router: RouterPort = { currentPath, renderLink: () => null };
  return render(
    <ShellNavigation
      compact={compact}
      groups={groups}
      presenter={testPresenter()}
      router={router}
    />,
  );
}

function toggleButtonFor(id: string) {
  return screen.getByRole('button', { name: `展开或收起${id}` });
}

function expectExpanded(id: string, value: string) {
  expect(toggleButtonFor(id).getAttribute('aria-expanded')).toBe(value);
}

afterEach(() => cleanup());

describe('Active Path Anchored Accordion（渲染）', () => {
  it('深层 active leaf 的完整祖先链同时展开（A 与 A1 均 expanded）', () => {
    const { unmount } = renderNav(deepFixtureGroups, '/a/a1');
    expectExpanded('A', 'true');
    expectExpanded('A1', 'true');
    expectExpanded('B', 'false');
    unmount();
  });

  it('同一 Active Path 多级祖先与另一条 exploration 链并存（不同 scope）', () => {
    const { unmount } = renderNav(deepFixtureGroups, '/a/a1');
    fireEvent.click(toggleButtonFor('B'));
    expectExpanded('A', 'true');
    expectExpanded('A1', 'true');
    expectExpanded('B', 'true');
    unmount();
  });

  it('跨 visual group：展开 B（groupB）替换 A（groupA）的 root exploration（A 非 active 时）', () => {
    const { unmount } = renderNav(deepFixtureGroups, '/plain');
    fireEvent.click(toggleButtonFor('A'));
    expectExpanded('A', 'true');
    fireEvent.click(toggleButtonFor('B'));
    expectExpanded('B', 'true');
    expectExpanded('A', 'false');
    unmount();
  });

  it('收起 active ancestor 的点击是 no-op（仍 expanded）', () => {
    const { unmount } = renderNav(deepFixtureGroups, '/a/a1');
    fireEvent.click(toggleButtonFor('A'));
    expectExpanded('A', 'true');
    expectExpanded('A1', 'true');
    unmount();
  });

  it('Route Commit 后旧 exploration 立即失效并被清空（首帧无旧 exploration 参与展开）', () => {
    const { rerender, unmount } = renderNav(deepFixtureGroups, '/plain');
    fireEvent.click(toggleButtonFor('B'));
    expectExpanded('B', 'true');
    rerender(
      <ShellNavigation
        compact={false}
        groups={deepFixtureGroups}
        presenter={testPresenter()}
        router={{ currentPath: '/c', renderLink: () => null }}
      />,
    );
    expectExpanded('B', 'false');
    // /c 的 leaf 位于 C 下 → C 是 active ancestor，由锚定展开
    expectExpanded('C', 'true');
    unmount();
  });

  it('same-route no-op：currentPath 不变时 exploration 保留', () => {
    const { rerender, unmount } = renderNav(deepFixtureGroups, '/plain');
    fireEvent.click(toggleButtonFor('B'));
    expectExpanded('B', 'true');
    rerender(
      <ShellNavigation
        compact={false}
        groups={deepFixtureGroups}
        presenter={testPresenter()}
        router={{ currentPath: '/plain', renderLink: () => null }}
      />,
    );
    expectExpanded('B', 'true');
    unmount();
  });

  it('Route Commit 后用户在新世代先 toggle，随后 effect 不清掉合法 exploration', () => {
    const { rerender, unmount } = renderNav(deepFixtureGroups, '/plain');
    fireEvent.click(toggleButtonFor('B'));
    expectExpanded('B', 'true');
    // 路由提交到 /b/b1（B、B1 成为 active 链）：exploration 被清空，active 锚定接管
    rerender(
      <ShellNavigation
        compact={false}
        groups={deepFixtureGroups}
        presenter={testPresenter()}
        router={{ currentPath: '/b/b1', renderLink: () => null }}
      />,
    );
    expectExpanded('B', 'true');
    expectExpanded('B1', 'true');
    // 再次同世代 rerender（模拟 effect 重复执行 / 无关渲染）：不清合法状态
    rerender(
      <ShellNavigation
        compact={false}
        groups={deepFixtureGroups}
        presenter={testPresenter()}
        router={{ currentPath: '/b/b1', renderLink: () => null }}
      />,
    );
    expectExpanded('B1', 'true');
    unmount();
  });

  it('重挂载（刷新模拟）恢复到唯一正确展开路径', () => {
    const first = renderNav(deepFixtureGroups, '/plain');
    fireEvent.click(toggleButtonFor('B'));
    expectExpanded('B', 'true');
    first.unmount();
    const { unmount } = renderNav(deepFixtureGroups, '/a/a1');
    expectExpanded('A', 'true');
    expectExpanded('A1', 'true');
    expectExpanded('B', 'false');
    unmount();
  });
});

describe('Compact Flyout 与 Expanded Accordion 状态分离', () => {
  it('compact 顶层 Flyout trigger 渲染可用且不创建 accordion 展开判定按钮', () => {
    const { container, unmount } = renderNav(deepFixtureGroups, '/plain', true);
    // compact 顶层 branch 渲染为 Flyout trigger（button，aria-label = branch label），
    // 不渲染 expanded accordion 的「展开或收起X」toggle 按钮（exploration 不驱动 compact 顶层）。
    const triggers = [...container.querySelectorAll('button')].filter((button) =>
      button.getAttribute('aria-label')?.includes('A'),
    );
    expect(triggers.length).toBeGreaterThan(0);
    const accordionToggles = [...container.querySelectorAll('button')].filter((button) =>
      button.getAttribute('aria-label')?.startsWith('展开或收起'),
    );
    expect(accordionToggles.length).toBe(0);
    unmount();
  });
});

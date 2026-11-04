import { describe, expect, it } from 'vitest';

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

/** 构造 descendantBranchIds：每个 branch -> 其子树全部 branch id（含自身）。 */
function descendantIndex(
  entries: ReadonlyArray<readonly [string, readonly string[]]>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(entries);
}

const rootTree = descendantIndex([
  ['A', ['A', 'A1']],
  ['A1', ['A1']],
  ['B', ['B', 'B1']],
  ['B1', ['B1']],
  ['C', ['C']],
]);

const noActive = new Set<string>();

describe('effectiveExplorationOf / routeKey gating', () => {
  it('routeKey 一致时返回 exploration，不一致时返回空', () => {
    const model = { routeKey: '/a', exploration: new Map([['root', 'B']]) };
    expect(effectiveExplorationOf(model, '/a').get('root')).toBe('B');
    expect(effectiveExplorationOf(model, '/b').size).toBe(0);
  });
});

describe('isBranchExpanded', () => {
  it('active ancestor 锚定展开，即使不在 exploration', () => {
    const exploration = new Map<string, string>();
    expect(
      isBranchExpanded({ branchId: 'A', scopeKey: 'root', isActiveAncestor: true, exploration }),
    ).toBe(true);
  });

  it('非 active 仅当是当前 scope 的 exploration 才展开', () => {
    const exploration = new Map([['root', 'B']]);
    expect(
      isBranchExpanded({ branchId: 'B', scopeKey: 'root', isActiveAncestor: false, exploration }),
    ).toBe(true);
    expect(
      isBranchExpanded({ branchId: 'C', scopeKey: 'root', isActiveAncestor: false, exploration }),
    ).toBe(false);
  });
});

describe('reduceNavigationAccordion: 顶层 root scope（跨 visual group 竞争）', () => {
  it('展开同 scope 顶层 B 替换 A 的 exploration（A/B 可来自不同 visual group）', () => {
    const model = emptyAccordionModel('/');
    const afterA = reduceNavigationAccordion(
      model,
      { branchId: 'A', scopeKey: accordionRootScope, expand: true, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    expect(afterA.exploration.get(accordionRootScope)).toBe('A');

    const afterB = reduceNavigationAccordion(
      afterA,
      { branchId: 'B', scopeKey: accordionRootScope, expand: true, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    // B 替换 A：root scope 只有 B，A 的子树 scope 也被清理
    expect([...afterB.exploration.entries()]).toEqual([[accordionRootScope, 'B']]);
  });
});

describe('reduceNavigationAccordion: subtree cleanup', () => {
  it('root 从 B 切到 C 时清除 B 子树内 exploration（B→B1 不残留）', () => {
    // 用户先展开 B（root），再展开 B1（scope B）
    const exploration: AccordionExploration = new Map([
      [accordionRootScope, 'B'],
      ['B', 'B1'],
    ]);
    const model = { routeKey: '/', exploration };
    const afterC = reduceNavigationAccordion(
      model,
      { branchId: 'C', scopeKey: accordionRootScope, expand: true, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    expect([...afterC.exploration.entries()]).toEqual([[accordionRootScope, 'C']]);
  });

  it('主动收起 B 清除 B 子树全部 exploration scope', () => {
    const exploration: AccordionExploration = new Map([
      [accordionRootScope, 'B'],
      ['B', 'B1'],
    ]);
    const model = { routeKey: '/', exploration };
    const collapsed = reduceNavigationAccordion(
      model,
      { branchId: 'B', scopeKey: accordionRootScope, expand: false, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    expect(collapsed.exploration.size).toBe(0);
  });

  it('重新展开 B 后 B1 不复活（子树已被清理）', () => {
    const exploration: AccordionExploration = new Map([
      [accordionRootScope, 'B'],
      ['B', 'B1'],
    ]);
    const model = { routeKey: '/', exploration };
    const collapsed = reduceNavigationAccordion(
      model,
      { branchId: 'B', scopeKey: accordionRootScope, expand: false, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    const reopened = reduceNavigationAccordion(
      collapsed,
      { branchId: 'B', scopeKey: accordionRootScope, expand: true, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    // B 展开，但 B1 不再展开
    expect(reopened.exploration.get(accordionRootScope)).toBe('B');
    expect(reopened.exploration.has('B')).toBe(false);
  });
});

describe('reduceNavigationAccordion: active 锚定', () => {
  const activeA = new Set(['A', 'A1']);

  it('展开 active ancestor 是 no-op（不进入 exploration）', () => {
    const model = emptyAccordionModel('/');
    const result = reduceNavigationAccordion(
      model,
      { branchId: 'A', scopeKey: accordionRootScope, expand: true, routeKey: '/' },
      { activeBranchIds: activeA, descendantBranchIds: rootTree },
    );
    expect(result.exploration.size).toBe(0);
  });

  it('收起 active ancestor 是 no-op（不允许隐藏当前 Route）', () => {
    const model = emptyAccordionModel('/');
    const result = reduceNavigationAccordion(
      model,
      { branchId: 'A', scopeKey: accordionRootScope, expand: false, routeKey: '/' },
      { activeBranchIds: activeA, descendantBranchIds: rootTree },
    );
    expect(result.exploration.size).toBe(0);
  });

  it('展开非 active B 时保留 active A（不同 scope 的 A 子树锚定不受影响）', () => {
    const model = emptyAccordionModel('/');
    const result = reduceNavigationAccordion(
      model,
      { branchId: 'B', scopeKey: accordionRootScope, expand: true, routeKey: '/' },
      { activeBranchIds: activeA, descendantBranchIds: rootTree },
    );
    // A 是 active（锚定展开，不在 map）；B 作为 exploration
    expect(result.exploration.get(accordionRootScope)).toBe('B');
    expect(result.exploration.has('A')).toBe(false);
  });
});

describe('reduceNavigationAccordion: routeKey 世代边界', () => {
  it('routeKey mismatch 时先归一空再应用新 toggle（不含旧 exploration）', () => {
    const model = { routeKey: '/old', exploration: new Map([[accordionRootScope, 'B']]) };
    const result = reduceNavigationAccordion(
      model,
      { branchId: 'C', scopeKey: accordionRootScope, expand: true, routeKey: '/new' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    expect(result.routeKey).toBe('/new');
    expect([...result.exploration.entries()]).toEqual([[accordionRootScope, 'C']]);
  });

  it('routeKey match 时正常 reducer（保留其它 scope exploration）', () => {
    const model = {
      routeKey: '/',
      exploration: new Map([
        [accordionRootScope, 'B'],
        ['B', 'B1'],
      ]),
    };
    const result = reduceNavigationAccordion(
      model,
      { branchId: 'C', scopeKey: accordionRootScope, expand: true, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    expect([...result.exploration.entries()]).toEqual([[accordionRootScope, 'C']]);
  });

  it('same-route no-op：routeKey 不变，toggle 继续保留原 exploration 语义', () => {
    const model = { routeKey: '/', exploration: new Map([[accordionRootScope, 'B']]) };
    // 用户收起 B（routeKey 仍为 /）
    const result = reduceNavigationAccordion(
      model,
      { branchId: 'B', scopeKey: accordionRootScope, expand: false, routeKey: '/' },
      { activeBranchIds: noActive, descendantBranchIds: rootTree },
    );
    expect(result.exploration.size).toBe(0);
    expect(result.routeKey).toBe('/');
  });
});

describe('resetAccordionModel', () => {
  it('返回空 exploration 并绑定新 routeKey', () => {
    const result = resetAccordionModel('/fresh');
    expect(result.routeKey).toBe('/fresh');
    expect(result.exploration.size).toBe(0);
  });
});

describe('carryAccordionModel（menuMemory=开，跨路由携带 exploration）', () => {
  it('推进 routeKey 并保留 exploration（可跨路由渲染展开）', () => {
    const model: AccordionModel = {
      routeKey: '/a',
      exploration: new Map([[accordionRootScope, 'B']]),
    };
    const carried = carryAccordionModel(model, '/b');
    expect(carried.routeKey).toBe('/b');
    expect(carried.exploration.get(accordionRootScope)).toBe('B');
    // 渲染门控：新 routeKey 下 exploration 有效（不再被清空）。
    expect(effectiveExplorationOf(carried, '/b').get(accordionRootScope)).toBe('B');
  });

  it('routeKey 一致时原样返回（不重建）', () => {
    const model = emptyAccordionModel('/a');
    expect(carryAccordionModel(model, '/a')).toBe(model);
  });

  it('携带后用户仍可收起该 exploration（约束不失效）', () => {
    const carried = carryAccordionModel(
      { routeKey: '/a', exploration: new Map([[accordionRootScope, 'B']]) },
      '/b',
    );
    const result = reduceNavigationAccordion(
      carried,
      { branchId: 'B', scopeKey: accordionRootScope, expand: false, routeKey: '/b' },
      { activeBranchIds: new Set<string>(), descendantBranchIds: rootTree },
    );
    expect(result.exploration.size).toBe(0);
  });

  it('active ancestor 仍锚定展开（不受携带影响）', () => {
    const carried = carryAccordionModel(
      { routeKey: '/a', exploration: new Map([[accordionRootScope, 'B']]) },
      '/c',
    );
    expect(
      isBranchExpanded({
        branchId: 'A',
        scopeKey: accordionRootScope,
        isActiveAncestor: true,
        exploration: effectiveExplorationOf(carried, '/c'),
      }),
    ).toBe(true);
  });
});

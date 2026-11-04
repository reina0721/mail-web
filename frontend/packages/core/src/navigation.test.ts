import type { NavigationNode } from '@community-go/types';
import { describe, expect, it } from 'vitest';

import {
  flattenNavigationLeaves,
  getFirstNavigationLeaf,
  getNavigationTreeErrors,
  isNavigationHrefActive,
} from './navigation';

const navigation: readonly NavigationNode[] = [
  { kind: 'leaf', id: 'home', labelKey: 'home', href: '/' },
  {
    kind: 'branch',
    id: 'parent',
    labelKey: 'parent',
    defaultHref: '/parent/first',
    children: [
      { kind: 'leaf', id: 'first', labelKey: 'first', href: '/parent/first' },
      {
        kind: 'branch',
        id: 'nested',
        labelKey: 'nested',
        defaultHref: '/parent/nested/deep',
        children: [{ kind: 'leaf', id: 'deep', labelKey: 'deep', href: '/parent/nested/deep' }],
      },
    ],
  },
];

describe('navigation tree', () => {
  it('递归展开叶子并保留完整祖先路径', () => {
    const leaves = flattenNavigationLeaves(navigation);
    expect(leaves.map(({ leaf }) => leaf.id)).toEqual(['home', 'first', 'deep']);
    expect(leaves[2]?.ancestors.map(({ id }) => id)).toEqual(['parent', 'nested']);
  });

  it('父节点默认地址必须指向首个可达叶子', () => {
    expect(getFirstNavigationLeaf(navigation[1]!)).toMatchObject({ id: 'first' });
    expect(getNavigationTreeErrors(navigation)).toEqual([]);
    expect(
      getNavigationTreeErrors([
        {
          kind: 'branch',
          id: 'invalid',
          labelKey: 'invalid',
          defaultHref: '/wrong',
          children: [{ kind: 'leaf', id: 'child', labelKey: 'child', href: '/child' }],
        },
      ]),
    ).toContain('invalid default href: invalid');
  });

  it('纯 Disclosure Branch（无 defaultHref）不校验默认地址，只展开/收起', () => {
    const disclosure: readonly NavigationNode[] = [
      {
        kind: 'branch',
        id: 'disclosure',
        labelKey: 'disclosure',
        children: [
          { kind: 'leaf', id: 'a', labelKey: 'a', href: '/a' },
          { kind: 'leaf', id: 'b', labelKey: 'b', href: '/b' },
        ],
      },
    ];
    expect(getNavigationTreeErrors(disclosure)).toEqual([]);
    // 子级仍参与扁平化（active/leaf 推导不受影响）
    expect(flattenNavigationLeaves(disclosure).map(({ leaf }) => leaf.id)).toEqual(['a', 'b']);
  });

  it('递归检查重复 ID 与地址', () => {
    expect(
      getNavigationTreeErrors([
        { kind: 'leaf', id: 'same', labelKey: 'one', href: '/same' },
        { kind: 'leaf', id: 'same', labelKey: 'two', href: '/same' },
      ]),
    ).toEqual(['duplicate id: same', 'duplicate href: /same']);
  });

  it('路径匹配只接受同一路径并兼容末尾斜杠', () => {
    expect(isNavigationHrefActive('/', '/')).toBe(true);
    expect(isNavigationHrefActive('/', '/foundations')).toBe(false);
    expect(isNavigationHrefActive('/page-archetypes', '/page-archetypes/')).toBe(true);
    expect(isNavigationHrefActive('/page-archetypes', '/page-archetypes-form')).toBe(false);
    expect(isNavigationHrefActive('/page-archetypes', '/page-archetypes/detail')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  isResolvedNavigationEqual,
  normalizePathnameForComparison,
  parseResolvedHref,
} from './navigation';

describe('parseResolvedHref', () => {
  it('拆分 pathname/search/hash（均不含前导分隔符）', () => {
    expect(parseResolvedHref('/ui-elements/forms?density=compact#intro')).toEqual({
      pathname: '/ui-elements/forms',
      search: 'density=compact',
      hash: 'intro',
    });
  });

  it('无 search/hash 时为空字符串', () => {
    expect(parseResolvedHref('/reference-resources')).toEqual({
      pathname: '/reference-resources',
      search: '',
      hash: '',
    });
  });

  it('空 hash 的 href 与带尾部 # 等价', () => {
    expect(parseResolvedHref('/a#')).toEqual({ pathname: '/a', search: '', hash: '' });
    expect(parseResolvedHref('/a')).toEqual({ pathname: '/a', search: '', hash: '' });
  });
});

describe('isResolvedNavigationEqual', () => {
  it('相同 pathname 等价（含尾斜杠差异）', () => {
    expect(
      isResolvedNavigationEqual(
        parseResolvedHref('/page-archetypes/resource-list'),
        parseResolvedHref('/page-archetypes/resource-list/'),
      ),
    ).toBe(true);
    expect(isResolvedNavigationEqual(parseResolvedHref('/'), parseResolvedHref('/'))).toBe(true);
  });

  it('不同 pathname 不等价', () => {
    expect(
      isResolvedNavigationEqual(parseResolvedHref('/motion'), parseResolvedHref('/foundations')),
    ).toBe(false);
  });

  it('search key 顺序无关但值敏感', () => {
    expect(
      isResolvedNavigationEqual(parseResolvedHref('/a?x=1&y=2'), parseResolvedHref('/a?y=2&x=1')),
    ).toBe(true);
    expect(
      isResolvedNavigationEqual(parseResolvedHref('/a?x=1'), parseResolvedHref('/a?x=2')),
    ).toBe(false);
  });

  it('空 search 与 ? 等价', () => {
    expect(isResolvedNavigationEqual(parseResolvedHref('/a'), parseResolvedHref('/a?'))).toBe(true);
  });

  it('hash 精确比较', () => {
    expect(
      isResolvedNavigationEqual(parseResolvedHref('/a#top'), parseResolvedHref('/a#top')),
    ).toBe(true);
    expect(isResolvedNavigationEqual(parseResolvedHref('/a#top'), parseResolvedHref('/a'))).toBe(
      false,
    );
  });

  it('search 值含特殊字符时按 URLSearchParams 语义比较', () => {
    expect(
      isResolvedNavigationEqual(parseResolvedHref('/a?q=a%20b'), parseResolvedHref('/a?q=a b')),
    ).toBe(true);
  });

  it('重复 key 值不同则不等价', () => {
    expect(
      isResolvedNavigationEqual(
        parseResolvedHref('/a?tag=1&tag=2'),
        parseResolvedHref('/a?tag=2&tag=1'),
      ),
    ).toBe(true);
    expect(
      isResolvedNavigationEqual(
        parseResolvedHref('/a?tag=1&tag=1'),
        parseResolvedHref('/a?tag=1&tag=2'),
      ),
    ).toBe(false);
  });
});

describe('normalizePathnameForComparison', () => {
  it('保留根路径，去除多余尾斜杠', () => {
    expect(normalizePathnameForComparison('/')).toBe('/');
    expect(normalizePathnameForComparison('/a//')).toBe('/a');
  });
});

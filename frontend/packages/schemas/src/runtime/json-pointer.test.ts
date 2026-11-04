import { describe, expect, it } from 'vitest';

import {
  JsonPointerError,
  escapePointerToken,
  evaluatePointer,
  hasPointer,
  joinPointerTokens,
  parsePointer,
  readPointer,
  unescapePointerToken,
} from './json-pointer';

describe('RFC 6901 JSON Pointer', () => {
  it('escape/unescape ~1 与 ~0', () => {
    expect(escapePointerToken('a/b')).toBe('a~1b');
    expect(escapePointerToken('a~b')).toBe('a~0b');
    expect(unescapePointerToken('a~1b')).toBe('a/b');
    expect(unescapePointerToken('a~0b')).toBe('a~b');
    // 顺序：先 ~1 后 ~0（RFC 6901 §3）。
    expect(unescapePointerToken('~01')).toBe('~1');
    expect(parsePointer('/a~1b')).toEqual(['a/b']);
  });

  it('joinPointerTokens 输出标准转义指针', () => {
    expect(joinPointerTokens([])).toBe('');
    expect(joinPointerTokens(['contracts', '@community-go/design-system'])).toBe(
      '/contracts/@community-go~1design-system',
    );
  });

  it('解析根与逐级路径', () => {
    expect(parsePointer('')).toEqual([]);
    expect(parsePointer('/a/b')).toEqual(['a', 'b']);
    expect(parsePointer('/a/0/b')).toEqual(['a', '0', 'b']);
  });

  it('非法 pointer（不以 / 开头）抛错', () => {
    expect(() => parsePointer('a/b')).toThrow(JsonPointerError);
  });

  it('求值存在/不存在/数组越界', () => {
    const doc = { a: { b: [10, 20] }, 'x/y': 1 };
    expect(evaluatePointer(doc, '/a/b/1')).toBe(20);
    expect(readPointer(doc, '/missing')).toEqual({ found: false, value: undefined });
    expect(hasPointer(doc, '/a/b')).toBe(true);
    expect(hasPointer(doc, '/a/b/5')).toBe(false);
    expect(() => evaluatePointer(doc, '/a/b/5')).toThrow(JsonPointerError);
    expect(evaluatePointer(doc, '/x~1y')).toBe(1);
  });

  it('contractRef 含 / 的 authorityId 经转义后可求值', () => {
    const registry = { contracts: { '@community-go/design-system': { maturity: 'stable' } } };
    const pointer = '/contracts/@community-go~1design-system';
    expect(parsePointer(pointer)).toEqual(['contracts', '@community-go/design-system']);
    expect(evaluatePointer(registry, pointer)).toEqual({ maturity: 'stable' });
  });
});

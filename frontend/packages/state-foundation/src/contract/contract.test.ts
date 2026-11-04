import { describe, expect, it } from 'vitest';

import { defineStoreContract } from './store';
import { formatPersistKey, type PersistNamespace } from './persist';
import {
  createNamespace,
  createPersistKey,
  isManagedKey,
  namespaceKey,
  DEFAULT_PRODUCT,
} from '../persist/namespace';

describe('defineStoreContract', () => {
  it('合法 contract 通过并冻结', () => {
    const c = defineStoreContract({ name: 'shell', scope: 'host', persistence: 'durable' });
    expect(c.name).toBe('shell');
    expect(c.scope).toBe('host');
    expect(c.persistence).toBe('durable');
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('缺省 persistence 为 none（不持久化是默认）', () => {
    const c = defineStoreContract({ name: 'editor', scope: 'plugin-private' });
    expect(c.persistence).toBe('none');
  });

  it('空 name 抛错', () => {
    expect(() => defineStoreContract({ name: ' ', scope: 'host' })).toThrow(/name/);
  });

  it('非法 scope / persistence 抛错', () => {
    expect(() => defineStoreContract({ name: 'x', scope: 'weird' as never })).toThrow(/scope/);
    expect(() =>
      defineStoreContract({ name: 'x', scope: 'host', persistence: 'cookie' as never }),
    ).toThrow(/persistence/);
  });
});

describe('persist namespace', () => {
  const ns: PersistNamespace = { product: 'community-go', scope: 'shell', store: 'ui' };

  it('formatPersistKey 三段展开', () => {
    expect(formatPersistKey(ns)).toBe('community-go.shell.ui');
  });

  it('缺 scope 时兼容单段历史 key', () => {
    expect(formatPersistKey({ product: 'community-go', scope: '', store: 'shell' })).toBe(
      'community-go.shell',
    );
  });

  it('createNamespace 默认 product 与空 scope', () => {
    expect(createNamespace('shell')).toEqual({
      product: 'community-go',
      scope: '',
      store: 'shell',
    });
    expect(namespaceKey(createNamespace('shell'))).toBe('community-go.shell');
    expect(createPersistKey('shell', 'host')).toBe('community-go.host.shell');
  });

  it('store 名不能为空', () => {
    expect(() => createNamespace('  ')).toThrow(/store/);
  });

  it('isManagedKey 识别受管前缀', () => {
    expect(isManagedKey('community-go.shell')).toBe(true);
    expect(isManagedKey('settings')).toBe(false);
    expect(isManagedKey('community-go')).toBe(true);
    expect(isManagedKey('community')).toBe(false);
    expect(DEFAULT_PRODUCT).toBe('community-go');
  });
});

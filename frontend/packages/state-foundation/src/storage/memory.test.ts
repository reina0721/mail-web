import { describe, expect, it } from 'vitest';

import { createMemoryBackend, createMemoryStorage } from './memory';

type Payload = { theme: 'light' | 'dark' };

describe('memory storage', () => {
  it('roundtrip（StorageValue JSON 形状）', () => {
    const storage = createMemoryStorage<Payload>();
    storage.setItem('k', { state: { theme: 'dark' }, version: 1 });
    expect(storage.getItem('k')).toEqual({ state: { theme: 'dark' }, version: 1 });
  });

  it('remove 后返回 null', () => {
    const storage = createMemoryStorage<Payload>();
    storage.setItem('k', { state: { theme: 'light' }, version: 1 });
    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
  });

  it('backend reset / entries / keys / 隔离', () => {
    const backend = createMemoryBackend({ a: '1' });
    backend.setItem('b', '2');
    expect([...backend.keys()].sort()).toEqual(['a', 'b']);
    expect(Object.fromEntries(backend.entries())).toEqual({ a: '1', b: '2' });
    backend.reset();
    expect(backend.keys()).toEqual([]);
    expect(backend.getItem('a')).toBeNull();
  });

  it('initial 初值透传', () => {
    const backend = createMemoryBackend({
      'community-go.test': '{"state":{"theme":"dark"},"version":1}',
    });
    expect(backend.getItem('community-go.test')).toContain('"theme":"dark"');
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { createLocalStorage } from './local';
import { createSessionStorage } from './session';

type Payload = { theme: 'light' | 'dark' };

describe('web storage adapters (jsdom)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('localStorage roundtrip（StorageValue JSON 形状）', () => {
    const storage = createLocalStorage<Payload>();
    // persist middleware 写入的是 { state, version }（StorageValue）；这里模拟之。
    storage.setItem('community-go.shell', { state: { theme: 'dark' }, version: 1 });
    expect(storage.getItem('community-go.shell')).toEqual({
      state: { theme: 'dark' },
      version: 1,
    });
    expect(window.localStorage.getItem('community-go.shell')).toContain('"theme":"dark"');
  });

  it('sessionStorage roundtrip + remove', () => {
    const storage = createSessionStorage<Payload>();
    storage.setItem('community-go.session', { state: { theme: 'light' }, version: 1 });
    expect(storage.getItem('community-go.session')).toEqual({
      state: { theme: 'light' },
      version: 1,
    });
    storage.removeItem('community-go.session');
    expect(storage.getItem('community-go.session')).toBeNull();
  });

  it('raw key 直接落 Web Storage（namespace 由 persist name 承载）', () => {
    const storage = createLocalStorage<Payload>();
    storage.setItem('community-go.shell', { state: { theme: 'dark' }, version: 1 });
    // key 不加额外前缀（避免双重前缀）；与历史 community-go.shell 兼容。
    expect(window.localStorage.getItem('community-go.shell')).not.toBeNull();
  });

  it('unavailablePolicy=noop 工厂可创建（lazy，无 window 也不崩）', () => {
    const storage = createLocalStorage<Payload>({ unavailablePolicy: 'noop' });
    expect(typeof storage.getItem).toBe('function');
  });
});

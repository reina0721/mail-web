import { describe, expect, it } from 'vitest';
import type { PersistStorage } from 'zustand/middleware';

import { createPersistStore } from '../framework';
import { createAsyncStorageFixture } from '../testing/async-storage';
import { createMemoryStorage } from '../storage/memory';
import { createHydrationLifecycle, getHydrationLifecycle, type HydrationStatus } from './lifecycle';
import { rehydrateStore } from './rehydrate';

type S = { theme: 'light' | 'dark' };
type SP = Partial<S>;

function makeStore(storage: PersistStorage<SP>) {
  return createPersistStore<S>(() => ({ theme: 'light' }), {
    name: 'community-go.test.hydration',
    version: 1,
    storage,
    skipHydration: true,
  });
}

const wait = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));

describe('hydration lifecycle', () => {
  it('sync storage：idle → hydrating → hydrated', async () => {
    const storage = createMemoryStorage<SP>();
    const store = makeStore(storage);
    const lc = createHydrationLifecycle(store);
    const seen: HydrationStatus[] = [];
    lc.subscribe((s) => seen.push(s));
    expect(lc.status).toBe('idle');
    expect(lc.trigger()).toBe(true);
    await wait();
    expect(seen).toContain('hydrating');
    expect(lc.status).toBe('hydrated');
  });

  it('async storage：hydrated 在异步完成后到达', async () => {
    const fixture = createAsyncStorageFixture<SP>();
    fixture.setItem('community-go.test.hydration', { state: { theme: 'dark' }, version: 1 });
    const store = makeStore(fixture);
    const lc = createHydrationLifecycle(store);
    expect(lc.trigger()).toBe(true);
    expect(lc.status).toBe('hydrating');
    await wait(30);
    expect(lc.status).toBe('hydrated');
    expect(store.getState().theme).toBe('dark');
  });

  it('repeated trigger 幂等（只发起一次）', async () => {
    const fixture = createAsyncStorageFixture<SP>();
    const store = makeStore(fixture);
    const lc = createHydrationLifecycle(store);
    expect(lc.trigger()).toBe(true); // 第一次发起
    expect(lc.trigger()).toBe(false); // hydrating 中不再发起
    expect(lc.trigger()).toBe(false);
    await wait(30);
    expect(lc.status).toBe('hydrated');
    expect(lc.trigger()).toBe(false); // 已 hydrated 不再发起
  });

  it('hydrated 后新 consumer 直接是 hydrated（不重复 rehydrate）', async () => {
    const fixture = createAsyncStorageFixture<SP>();
    const store = makeStore(fixture);
    rehydrateStore(store);
    await wait(30);
    const lc2 = getHydrationLifecycle(store) ?? createHydrationLifecycle(store);
    expect(lc2.status).toBe('hydrated');
    expect(lc2.trigger()).toBe(false);
  });

  it('hydration 失败进入 error', async () => {
    const fixture = createAsyncStorageFixture<SP>();
    const store = makeStore(fixture);
    const lc = createHydrationLifecycle(store);
    (fixture as { fixture: { failNextGet(): void } }).fixture.failNextGet();
    lc.trigger();
    await wait(30);
    expect(lc.status).toBe('error');
  });

  it('多 consumer 订阅同一 lifecycle 都收到通知', async () => {
    const fixture = createAsyncStorageFixture<SP>();
    const store = makeStore(fixture);
    const lc = createHydrationLifecycle(store);
    const a: HydrationStatus[] = [];
    const b: HydrationStatus[] = [];
    lc.subscribe((s) => a.push(s));
    lc.subscribe((s) => b.push(s));
    lc.trigger();
    await wait(30);
    expect(a).toContain('hydrated');
    expect(b).toContain('hydrated');
    expect(lc.status).toBe('hydrated');
  });

  it('Strict Mode 语义：两次 mount 触发不产生重复错误 lifecycle', async () => {
    const fixture = createAsyncStorageFixture<SP>();
    const store = makeStore(fixture);
    // 模拟 Strict Mode 双调用：同一 lifecycle 上两次 trigger
    const lc = createHydrationLifecycle(store);
    lc.trigger();
    lc.trigger(); // 幂等
    await wait(30);
    expect(lc.status).toBe('hydrated');
    // 第二次 createHydrationLifecycle 返回同一实例（registry 单例）
    expect(createHydrationLifecycle(store)).toBe(lc);
  });
});

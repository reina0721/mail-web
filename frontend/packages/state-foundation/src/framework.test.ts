// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import type { StateCreator } from 'zustand/vanilla';
import { createPersistStore } from './framework';
import { createMemoryStorage } from './storage/memory';

type DemoState = {
  theme: 'light' | 'dark';
  transient: number;
  setTheme: (t: 'light' | 'dark') => void;
  bump: () => void;
};

function makeInitializer(): StateCreator<DemoState, [['zustand/persist', unknown]]> {
  return (set) => ({
    theme: 'light',
    transient: 0,
    setTheme: (t) => set({ theme: t }),
    bump: () => set((state) => ({ transient: state.transient + 1 })),
  });
}

describe('createPersistStore', () => {
  let memory: ReturnType<typeof createMemoryStorage<Partial<DemoState>>>;
  const KEY = 'community-go.test.persist';

  beforeEach(() => {
    window.localStorage.clear();
    memory = createMemoryStorage<Partial<DemoState>>();
  });

  it('partialize 只持久化显式字段（白名单）', () => {
    const store = createPersistStore<DemoState>(makeInitializer(), {
      name: KEY,
      version: 1,
      storage: memory,
      partialize: (s) => ({ theme: s.theme }),
    });
    store.getState().setTheme('dark');
    store.getState().bump(); // transient 不应被持久化
    void store.persist.rehydrate();
    const raw = memory.backend.getItem(KEY);
    expect(raw).toContain('"theme":"dark"');
    expect(raw).not.toContain('"transient"');
  });

  it('version mismatch 触发 migrate', () => {
    // 预写旧 version=0 的数据
    memory.backend.setItem(KEY, JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
    const migrated: string[] = [];
    const store = createPersistStore<DemoState>(makeInitializer(), {
      name: KEY,
      version: 1,
      storage: memory,
      partialize: (s) => ({ theme: s.theme }),
      migrate: (persisted, version) => {
        migrated.push(String(version));
        return { theme: (persisted as { theme?: string }).theme === 'dark' ? 'light' : 'dark' };
      },
    });
    void store.persist.rehydrate();
    expect(migrated).toEqual(['0']);
  });

  it('skipHydration 下 rehydrate 前用默认值，后恢复', () => {
    memory.backend.setItem(KEY, JSON.stringify({ state: { theme: 'dark' }, version: 1 }));
    const store = createPersistStore<DemoState>(makeInitializer(), {
      name: KEY,
      version: 1,
      storage: memory,
      skipHydration: true,
      partialize: (s) => ({ theme: s.theme }),
    });
    expect(store.getState().theme).toBe('light'); // 未 rehydrate
    void store.persist.rehydrate();
    // rehydrate 是异步（微任务）；等待后应恢复 dark
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(store.getState().theme).toBe('dark');
        resolve();
      }, 10);
    });
  });

  it('clearStorage 清空持久化', () => {
    const store = createPersistStore<DemoState>(makeInitializer(), {
      name: KEY,
      version: 1,
      storage: memory,
      partialize: (s) => ({ theme: s.theme }),
    });
    store.getState().setTheme('dark');
    void store.persist.rehydrate();
    store.persist.clearStorage();
    expect(memory.backend.getItem(KEY)).toBeNull();
  });

  it('merge 自定义合并', () => {
    memory.backend.setItem(KEY, JSON.stringify({ state: { theme: 'dark' }, version: 1 }));
    const store = createPersistStore<DemoState>(makeInitializer(), {
      name: KEY,
      version: 1,
      storage: memory,
      partialize: (s) => ({ theme: s.theme }),
      merge: (persisted, current) => ({
        ...current,
        theme: (persisted as { theme?: 'light' | 'dark' }).theme ?? current.theme,
      }),
    });
    void store.persist.rehydrate();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(store.getState().theme).toBe('dark');
        expect(store.getState().transient).toBe(0); // merge 保留未持久化字段默认
        resolve();
      }, 10);
    });
  });
});

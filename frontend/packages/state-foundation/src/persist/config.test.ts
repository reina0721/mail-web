// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { definePersistConfig } from './config';
import { createMemoryStorage } from '../storage/memory';

type DemoState = { theme: 'light' | 'dark'; transient: number };

describe('definePersistConfig', () => {
  it('合法 config 通过（默认 storage 为 lazy local）', () => {
    const opts = definePersistConfig<DemoState, Partial<DemoState>>({
      name: 'community-go.shell',
      version: 1,
      partialize: (s) => ({ theme: s.theme }),
      skipHydration: true,
    });
    expect(opts.name).toBe('community-go.shell');
    expect(opts.version).toBe(1);
    expect(opts.skipHydration).toBe(true);
    expect(typeof opts.storage).toBe('object');
  });

  it('空 name 抛错', () => {
    expect(() => definePersistConfig<DemoState>({ name: ' ', version: 1 })).toThrow(/name/);
  });

  it('非受管 name（裸 key）抛错', () => {
    expect(() => definePersistConfig<DemoState>({ name: 'settings', version: 1 })).toThrow(
      /namespace/,
    );
  });

  it('非法 version（负/非整数）抛错', () => {
    expect(() =>
      definePersistConfig<DemoState>({ name: 'community-go.shell', version: -1 }),
    ).toThrow(/version/);
    expect(() =>
      definePersistConfig<DemoState>({ name: 'community-go.shell', version: 1.5 }),
    ).toThrow(/version/);
  });

  it('显式 storage 优先（memory）', () => {
    const memory = createMemoryStorage<Partial<DemoState>>();
    const opts = definePersistConfig<DemoState, Partial<DemoState>>({
      name: 'community-go.shell',
      version: 1,
      storage: memory,
    });
    expect(opts.storage).toBe(memory);
  });
});

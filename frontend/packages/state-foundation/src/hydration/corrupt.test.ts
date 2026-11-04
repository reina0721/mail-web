// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createPersistStore } from '../index';
import { createLocalStorage } from '../storage/local';

type S = { value: string; setValue: (v: string) => void };
type P = { value: string };

describe('persist corrupt JSON 错误语义', () => {
  it('非法 JSON：onRehydrateStorage error 回调触发（不静默）', async () => {
    window.localStorage.setItem('community-go.test.corrupt', '{bad-json');
    let reported: unknown = 'not-called';
    const store = createPersistStore<S, P>(
      (set) => ({
        value: 'default',
        setValue: (value) => set({ value }),
      }),
      {
        name: 'community-go.test.corrupt',
        version: 1,
        skipHydration: true,
        storage: createLocalStorage(),
        partialize: ({ value }) => ({ value }),
        onRehydrateStorage: () => (_state, error) => {
          reported = error ?? null;
        },
      },
    );
    const { rehydrateStore } = await import('./rehydrate');
    rehydrateStore(store);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reported).not.toBe('not-called');
    expect(reported).toBeInstanceOf(Error);
    // 非法 JSON 的 parse 错误（而非无记录成功路径）。
    expect(String((reported as Error).message)).toContain('JSON');
  });
});

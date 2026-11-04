import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPeriodicRefresh,
  PERIODIC_REFRESH_INTERVAL_MS,
  shouldPauseRefresh,
} from './periodic-refresh';

describe('shouldPauseRefresh（定期刷新暂停策略，SET-006-004）', () => {
  it('后台/离线/提交中/未提交编辑任一 → 暂停', () => {
    expect(
      shouldPauseRefresh({ hidden: true, offline: false, submitting: false, hasDirtyInput: false }),
    ).toBe(true);
    expect(
      shouldPauseRefresh({ hidden: false, offline: true, submitting: false, hasDirtyInput: false }),
    ).toBe(true);
    expect(
      shouldPauseRefresh({ hidden: false, offline: false, submitting: true, hasDirtyInput: false }),
    ).toBe(true);
    expect(
      shouldPauseRefresh({ hidden: false, offline: false, submitting: false, hasDirtyInput: true }),
    ).toBe(true);
  });

  it('全部就绪 → 不暂停', () => {
    expect(
      shouldPauseRefresh({
        hidden: false,
        offline: false,
        submitting: false,
        hasDirtyInput: false,
      }),
    ).toBe(false);
  });

  it('预设周期集中为 60s', () => {
    expect(PERIODIC_REFRESH_INTERVAL_MS).toBe(60_000);
  });
});

describe('createPeriodicRefresh（控制器）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start 后按周期触发 onTick；stop 清理', () => {
    const onTick = vi.fn();
    const controller = createPeriodicRefresh({
      intervalMs: 1_000,
      isPaused: () => false,
      onTick,
    });
    controller.start();
    expect(controller.isRunning()).toBe(true);
    vi.advanceTimersByTime(3_000);
    expect(onTick).toHaveBeenCalledTimes(3);
    controller.stop();
    expect(controller.isRunning()).toBe(false);
    vi.advanceTimersByTime(3_000);
    expect(onTick).toHaveBeenCalledTimes(3); // 停止后不再触发
  });

  it('start 幂等（重复 start 不叠加 interval）', () => {
    const onTick = vi.fn();
    const controller = createPeriodicRefresh({ intervalMs: 1_000, isPaused: () => false, onTick });
    controller.start();
    controller.start();
    vi.advanceTimersByTime(2_000);
    expect(onTick).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('暂停（isPaused=true）期间跳过 tick；恢复后继续', () => {
    const onTick = vi.fn();
    let paused = false;
    const controller = createPeriodicRefresh({
      intervalMs: 1_000,
      isPaused: () => paused,
      onTick,
    });
    controller.start();
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    paused = true;
    vi.advanceTimersByTime(2_000);
    expect(onTick).toHaveBeenCalledTimes(1); // 暂停期间跳过
    paused = false;
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(2); // 恢复后下一周期触发
    controller.stop();
  });

  it('不并发重入：onTick pending 期间跳过后续 tick', () => {
    const deferred: { resolve: () => void } = { resolve: () => undefined };
    const onTick = vi.fn(
      () =>
        new Promise<void>((resolve: (value: void | PromiseLike<void>) => void) => {
          deferred.resolve = () => resolve();
        }),
    );
    const controller = createPeriodicRefresh({ intervalMs: 1_000, isPaused: () => false, onTick });
    controller.start();
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    // pending 中再走 3 个周期 → 不重入
    vi.advanceTimersByTime(3_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    deferred.resolve();
    controller.stop();
  });
});

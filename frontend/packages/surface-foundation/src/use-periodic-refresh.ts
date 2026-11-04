'use client';

/* Library entry同时导出 Hook，不是应用 Fast Refresh 边界。 */

import { useEffect, useLayoutEffect, useRef } from 'react';

import { createPeriodicRefresh, PERIODIC_REFRESH_INTERVAL_MS } from './periodic-refresh';

export type UsePeriodicRefreshInput = Readonly<{
  /** 是否启用（如操作偏好 refreshMode=periodic）；false 时不启动。 */
  enabled: boolean;
  /** 当前是否应暂停（后台/离线/提交中/未提交编辑）。 */
  isPaused: () => boolean;
  /** 每次允许刷新时执行（不并发重入）。 */
  onTick: () => void | Promise<void>;
  /** 覆盖周期（测试/特殊用途；产品默认 60s 由 PERIODIC_REFRESH_INTERVAL_MS 集中）。 */
  intervalMs?: number;
}>;

/**
 * 定期刷新 hook（SET-006-004）：
 * - enabled 且组件挂载时启动 interval；卸载自动 stop（资源清理）；
 * - isPaused 每 tick 读取最新值（经 ref 持有，不重建监听）；
 * - enabled 变化时启停。
 */
export function usePeriodicRefresh({
  enabled,
  isPaused,
  onTick,
  intervalMs,
}: UsePeriodicRefreshInput): void {
  const isPausedRef = useRef(isPaused);
  const onTickRef = useRef(onTick);
  useLayoutEffect(() => {
    isPausedRef.current = isPaused;
    onTickRef.current = onTick;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = createPeriodicRefresh({
      intervalMs: intervalMs ?? PERIODIC_REFRESH_INTERVAL_MS,
      isPaused: () => isPausedRef.current(),
      onTick: () => onTickRef.current(),
    });
    controller.start();
    return () => controller.stop();
  }, [enabled, intervalMs]);
}

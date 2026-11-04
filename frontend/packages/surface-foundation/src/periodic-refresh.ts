/**
 * Surface Foundation —— 定期刷新策略（纯函数，SET-006-004）。
 *
 * 统一为产品预设周期（60s 内部集中，不向用户暴露实现参数）；后台/离线/提交中暂停；
 * 不并发重入；卸载清理由调用方 hook 保证。纯规则无 React/浏览器依赖，可独立单测。
 */

/** 产品预设定期刷新周期（ms）：内部集中为 60s。 */
export const PERIODIC_REFRESH_INTERVAL_MS = 60_000;

export type RefreshPauseState = Readonly<{
  /** 页面不可见（后台标签/最小化）。 */
  hidden: boolean;
  /** 浏览器离线。 */
  offline: boolean;
  /** 正在提交（不打断用户提交/不覆盖未提交编辑）。 */
  submitting: boolean;
  /** 存在未提交编辑（不覆盖用户输入）。 */
  hasDirtyInput: boolean;
}>;

/**
 * 是否应暂停一次周期刷新：
 * - 后台（hidden）暂停；
 * - 离线暂停；
 * - 提交中暂停；
 * - 存在未提交编辑（dirty）暂停（不覆盖未提交输入）。
 */
export function shouldPauseRefresh(state: RefreshPauseState): boolean {
  return state.hidden || state.offline || state.submitting || state.hasDirtyInput;
}

export type PeriodicRefreshInput = Readonly<{
  /** 刷新周期；缺省 PERIODIC_REFRESH_INTERVAL_MS。 */
  intervalMs?: number;
  /** 当前是否应暂停（读取最新值，供每次 tick 前判定）。 */
  isPaused: () => boolean;
  /** 每次允许刷新时执行（不并发重入：上一次 onTick 未结束前不触发下一次）。 */
  onTick: () => void | Promise<void>;
}>;

/**
 * 创建周期刷新控制器：
 * - start()：启动 interval（幂等）；stop()：停止（卸载清理）；isRunning()；
 * - 每 tick 先判 isPaused()：暂停则跳过本次（不等时长累积，下一周期恢复）；
 * - 不并发重入：onTick 返回 Promise 时，pending 期间跳过后续 tick。
 */
export function createPeriodicRefresh(input: PeriodicRefreshInput) {
  const intervalMs = input.intervalMs ?? PERIODIC_REFRESH_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let pending = false;

  const tick = async () => {
    if (pending) return; // 上一次未完成 → 不并发重入
    if (input.isPaused()) return; // 后台/离线/提交中/未提交编辑 → 跳过本次
    const result = input.onTick();
    // 仅当返回 thenable 才进入 pending（同步 onTick 立即完成，不阻塞下一周期）。
    if (result && typeof result.then === 'function') {
      pending = true;
      try {
        await result;
      } finally {
        pending = false;
      }
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      timer = setInterval(() => void tick(), intervalMs);
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      running = false;
      pending = false;
    },
    isRunning() {
      return running;
    },
  };
}

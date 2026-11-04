import type { ReactNode } from 'react';

// AsyncRegion：Async Content Transition 语义容器（recipe: content.enter），
// 解决"数据就绪但内容突然出现"。职责边界（权威：docs/motion-foundation.md §5/§10）：
// - 只处理数据 readiness，不处理是否进入视口（ViewportReveal 的职责）；
// - initial/empty/error 进入有内容状态时播放 content.enter；refresh/background 保留旧内容；
// - 不暴露 duration/easing；动画参数全部来自 design-system 配方与 Policy。

export type AsyncRegionPhase =
  'initial' | 'ready' | 'refreshing' | 'background' | 'empty' | 'error';

export type AsyncRegionProps = Readonly<{
  phase: AsyncRegionPhase;
  /** 容器 aria-label：整块异步区域的可访问名称（辅助技术可见）。 */
  label: string;
  /** ready 内容：始终渲染以保留结构；无内容阶段 hidden，有内容阶段保持同一实例。 */
  children: ReactNode;
  /** initial 层：调用方组合 Skeleton 等。 */
  loading: ReactNode;
  /** refreshing 层：保留 ready 内容时显示局部 Pending。 */
  refreshing: ReactNode;
  /** error 层：调用方组合 StateSurface（含恢复动作）。 */
  error: ReactNode;
  /** empty 层：调用方组合 StateSurface（含恢复动作）。 */
  empty: ReactNode;
}>;

export function AsyncRegion({
  phase,
  label,
  children,
  loading,
  refreshing,
  error,
  empty,
}: AsyncRegionProps) {
  const contentAvailable = phase === 'ready' || phase === 'refreshing' || phase === 'background';
  return (
    <div
      className="ui-async-region"
      data-motion-recipe="async"
      data-phase={phase}
      role="region"
      aria-label={label}
      aria-busy={phase === 'initial' || phase === 'refreshing' ? true : undefined}
    >
      {phase === 'initial' ? loading : null}
      {phase === 'error' ? error : null}
      {phase === 'empty' ? empty : null}
      {phase === 'refreshing' ? refreshing : null}
      <div className="ui-async-region-content" hidden={!contentAvailable}>
        {children}
      </div>
    </div>
  );
}

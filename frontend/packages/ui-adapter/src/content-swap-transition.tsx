'use client';

import { useState, type ReactNode } from 'react';

export type ContentSwapTransitionProps = Readonly<{
  contentKey: string;
  children: ReactNode;
  /** A parent collection may mount this subtree as the result of an actual selection change. */
  initialChange?: boolean;
}>;

/**
 * ContentSwapTransition —— 同一路由内容域的替换过渡。
 *
 * 早期实现依赖 React `ViewTransition`（canary 专属，stable react 不导出该组件，
 * 运行时为 undefined → 过渡从不触发）。现改为 **CSS 挂载动画**：contentKey 变化
 * 时 key 驱动子树重挂，`.ui-content-swap-surface` 的新内容播放统一 fade-in
 * （data-motion-swap 关闭时由 Motion Policy 全局降级为 0.01ms）。
 *
 * 语义：内容替换的短 crossfade 降级为新内容淡入（React 同步替换旧内容，无快照
 * 退出）；克制、不阻塞。不承担数据请求状态。
 */
export function ContentSwapTransition({
  contentKey,
  children,
  initialChange = false,
}: ContentSwapTransitionProps) {
  const [entry, setEntry] = useState({ key: contentKey, changed: initialChange });
  if (entry.key !== contentKey) setEntry({ key: contentKey, changed: true });
  return (
    <div
      className="ui-content-swap-surface"
      data-motion-recipe="content-swap"
      data-swap-entry={entry.changed ? 'true' : 'false'}
      key={contentKey}
    >
      {children}
    </div>
  );
}

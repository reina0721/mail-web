/**
 * Plugin Framework —— Workbench Capability Port（client）。
 *
 * `@community-go/plugin-framework/workbench`：收藏与最近访问的公共契约 + client
 * Provider/context/hook。Host 注入实现（独立持久化 store，不混入设置记录）。
 *
 * 语义：
 * - 页面通过稳定身份（resolved pathname）读写收藏/最近；标题为记录时的展示标题；
 * - "关闭记录"停止后续写入但**不删除已有内容**（Store 语义），用户主动移除仍生效；
 * - 公共 Pattern 至少两个独立参考场景验证（设置中心 + 首页工作区段）。
 */

'use client';

/* Library entry同时导出 Provider、Hook，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, type ReactNode } from 'react';

/** 最近访问条目（稳定页面身份 + 展示标题 + 时间戳）。 */
export type WorkbenchRecent = Readonly<{
  pathname: string;
  title: string;
  visitedAt: number;
}>;

/** 收藏条目（稳定页面身份 + 展示标题）。 */
export type WorkbenchFavorite = Readonly<{
  pathname: string;
  title: string;
}>;

/** Workbench Port：读收藏/最近 + 收藏切换。 */
export type WorkbenchPort = Readonly<{
  /** 最近访问（新→旧）。 */
  listRecents(): readonly WorkbenchRecent[];
  /** 收藏（新→旧）。 */
  listFavorites(): readonly WorkbenchFavorite[];
  /** 是否已收藏该 pathname。 */
  isFavorite(pathname: string): boolean;
  /** 收藏切换（返回切换后是否已收藏）。 */
  toggleFavorite(entry: { pathname: string; title: string }): boolean;
  /** 订阅工作台变化；返回取消函数。 */
  subscribe(listener: () => void): () => void;
}>;

const WorkbenchContext = createContext<WorkbenchPort | null>(null);

/** Host 装配 Workbench Port；必须在 Root Provider 中只安装一次。 */
export function WorkbenchProvider({
  port,
  children,
}: Readonly<{ port: WorkbenchPort; children: ReactNode }>) {
  return <WorkbenchContext.Provider value={port}>{children}</WorkbenchContext.Provider>;
}

/** 读取 Workbench Port。 */
export function useWorkbenchPort(): WorkbenchPort {
  const port = useContext(WorkbenchContext);
  if (!port) {
    throw new Error('WorkbenchProvider 未安装：Workbench Port 属于 application runtime context。');
  }
  return port;
}

/**
 * Plugin Framework —— Workspace Capability Port（client）。
 *
 * `@community-go/plugin-framework/workspace`：工作状态（列表状态/草稿）按页面身份
 * 保存/恢复的公共契约 + client Provider/context/hook。Host 注入实现（独立 store，
 * 不混入 `community-go.shell` 设置记录——见 107 migration-cleanup）。
 *
 * 语义：
 * - 页面显式声明**允许保存字段白名单**（禁止黑名单思维）；
 * - 恢复不是业务提交：草稿保持“未提交”；业务提交成功后调用 clearPageState；
 * - 草稿冲突（多窗口/刷新时序）不静默覆盖：save 返回冲突态由页面选择；
 * - 列表状态（筛选/分页/滚动）与草稿分离；恢复不恢复“危险的批量选择”。
 */

'use client';

/* Library entry同时导出 Provider、Hook，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, type ReactNode } from 'react';

/** 页面声明允许保存的字段描述（白名单）。 */
export type PageStateDescriptor<Fields extends string> = Readonly<{
  /** 稳定页面身份（Route Target + 实体标识语义；筛选/排序变化不产生新身份）。 */
  pageId: string;
  /** 页面状态版本：与当前页面结构不符时恢复层过滤失效字段。 */
  version: number;
  /** 允许持久化的草稿字段白名单。 */
  draftFields: readonly Fields[];
  /** 是否允许保存列表状态（筛选/分页/滚动）。 */
  allowListState: boolean;
}>;

/** 页面状态保存结果：成功 | 冲突（另一窗口/时序已有新草稿，由调用方选择）。 */
export type SavePageStateResult = { ok: true } | { ok: false; conflict: true; reason: string };

/** 页面状态恢复结果。 */
export type PageState<Fields extends string> = Readonly<{
  pageId: string;
  version: number;
  list?: Readonly<{
    filters: Readonly<Record<string, string>>;
    page: number;
    pageSize: number;
    scrollTop: number;
  }>;
  draft?: Readonly<Partial<Record<Fields, unknown>>>;
}>;

/**
 * Workspace Port（通用）：按页面身份读写页面状态与草稿。
 * Host 注入实现；descriptor 由页面在 registerPageState 时声明。
 */
export type WorkspacePort<Fields extends string> = Readonly<{
  /** 注册页面状态描述（可重复注册，以最新为准）；返回取消注册。 */
  registerPageState(descriptor: PageStateDescriptor<Fields>): () => void;
  /** 保存页面状态（list + 草稿字段，白名单过滤由实现保证）；冲突不静默覆盖。 */
  savePageState(
    pageId: string,
    input: Readonly<{
      list?: PageState<Fields>['list'];
      draft?: Readonly<Record<string, unknown>>;
    }>,
  ): SavePageStateResult;
  /** 恢复页面状态；无记录返回 null。 */
  restorePageState(pageId: string): PageState<Fields> | null;
  /** 业务提交成功后清除页面状态/草稿。 */
  clearPageState(pageId: string): void;
}>;

const WorkspaceContext = createContext<WorkspacePort<string> | null>(null);

/** Host 装配 Workspace Port；必须在 Root Provider 中只安装一次。 */
export function WorkspaceProvider<Fields extends string>({
  port,
  children,
}: Readonly<{ port: WorkspacePort<Fields>; children: ReactNode }>) {
  return <WorkspaceContext.Provider value={port}>{children}</WorkspaceContext.Provider>;
}

/** 读取 Workspace Port。 */
export function useWorkspacePort<Fields extends string>(): WorkspacePort<Fields> {
  const port = useContext(WorkspaceContext);
  if (!port) {
    throw new Error('WorkspaceProvider 未安装：Workspace Port 属于 application runtime context。');
  }
  return port;
}

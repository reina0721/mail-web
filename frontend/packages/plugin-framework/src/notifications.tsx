/**
 * Plugin Framework —— Notifications Capability Port（client）。
 *
 * `@community-go/plugin-framework/notifications`：通知中心的公共契约 + client
 * Provider/context/hook。Host 注入实现（独立持久化 store，收纳真实前端事件与真实
 * 本地任务结果；不预填虚构通知）。
 *
 * 语义：
 * - 事件为受控类别 + 严重性 + 关联 ID + 展示文本 + 可选 Route Target；
 *   **持久化内容不包含函数**（跳转存 Route Target 形状，经导航 Port 消费）；
 * - 高风险/错误/安全类别不可被偏好关闭（产品强制，Host 实现保证）；
 * - 未读/角标由 Host store 计算；Toast 仍是瞬时反馈层（业务按需双写）。
 */

'use client';

/* Library entry同时导出 Provider、Hook，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, type ReactNode } from 'react';

/** 受控通知类别。 */
export const NOTIFICATION_CATEGORIES = ['system', 'success', 'failure', 'warning', 'task'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_SEVERITIES = ['info', 'notice', 'critical'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/** 可序列化跳转目标（Route Target 形状；持久化内容无函数）。 */
export type NotificationRouteTarget = Readonly<{
  routeId: string;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
  fragment?: string;
}>;

/** 一条通知（可序列化；持久化/跨窗口同步安全）。 */
export type NotificationItem = Readonly<{
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  /** 关联业务 ID（如本地任务 id）；用于去重/聚合。 */
  relatedId?: string;
  title: string;
  description?: string;
  target?: NotificationRouteTarget;
  createdAt: number;
  read: boolean;
}>;

/** 通知 Port：发布/订阅/已读管理。 */
export type NotificationsPort = Readonly<{
  /** 发布一条通知；返回其 id。关键/错误类别不可被偏好关闭（实现保证收纳）。 */
  publish(input: Readonly<Omit<NotificationItem, 'id' | 'createdAt' | 'read'>>): string;
  /** 当前通知列表（新→旧）。 */
  list(): readonly NotificationItem[];
  /** 未读数。 */
  unreadCount(): number;
  /** 订阅中心变化；返回取消函数。 */
  subscribe(listener: () => void): () => void;
  markRead(id: string): void;
  markAllRead(): void;
}>;

const NotificationsContext = createContext<NotificationsPort | null>(null);

/** Host 装配 Notifications Port；必须在 Root Provider 中只安装一次。 */
export function NotificationsProvider({
  port,
  children,
}: Readonly<{ port: NotificationsPort; children: ReactNode }>) {
  return <NotificationsContext.Provider value={port}>{children}</NotificationsContext.Provider>;
}

/** 读取 Notifications Port。 */
export function useNotificationsPort(): NotificationsPort {
  const port = useContext(NotificationsContext);
  if (!port) {
    throw new Error(
      'NotificationsProvider 未安装：Notifications Port 属于 application runtime context。',
    );
  }
  return port;
}

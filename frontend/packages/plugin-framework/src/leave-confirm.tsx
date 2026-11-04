/**
 * Plugin Framework —— Leave-confirm Capability Port（client）。
 *
 * `@community-go/plugin-framework/leave-confirm`：页面把"未提交输入（dirty）"上报给
 * Host 的统一导航保护。Host 在任何应用内导航提交前询问（见 107 SET-005-001 Host
 * leave-confirm 接线）；**取消不改变路由/标签/进度**；刷新/关闭仅 dirty 时注册
 * beforeunload（平台限制内）。
 *
 * 设计约束（R107-002）：
 * - 框架只定义通用 Port 形状 + Provider/context/hook（react peer）；
 * - Plugin 页（reference-resources 等）经本 Port 注册 dirty source，不 import
 *   apps/web（依赖方向 surface → framework）；
 * - 卸载时取消注册（AGENTS §3.4 资源清理）。
 */

'use client';

/* Library entry同时导出 Provider、Hook，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';

/** 页面上报的 dirty source（语义与 Host 端一致）。 */
export type PluginDirtySource = Readonly<{
  pageId: string;
  /** 离开文案（如有未保存的更改）。 */
  message: () => string;
  /** 当前是否 dirty（未提交输入）。 */
  isDirty: () => boolean;
  /** 是否提交中（提交中不额外询问）。 */
  isSubmitting?: () => boolean;
}>;

/**
 * Leave-confirm Port：Host 注入实现（把 source 交给 Host 注册表 + beforeunload）。
 */
export type LeaveConfirmPort = Readonly<{
  /** 注册 dirty source；返回取消注册函数（页面卸载必须调用）。 */
  registerDirtySource(source: PluginDirtySource): () => void;
}>;

const LeaveConfirmContext = createContext<LeaveConfirmPort | null>(null);

/** Host 装配 Leave-confirm Port；必须在 Root Provider 中只安装一次。 */
export function LeaveConfirmProvider({
  port,
  children,
}: Readonly<{ port: LeaveConfirmPort; children: ReactNode }>) {
  return <LeaveConfirmContext.Provider value={port}>{children}</LeaveConfirmContext.Provider>;
}

/** 读取 Leave-confirm Port。 */
export function useLeaveConfirmPort(): LeaveConfirmPort {
  const port = useContext(LeaveConfirmContext);
  if (!port) {
    throw new Error(
      'LeaveConfirmProvider 未安装：Leave-confirm Port 属于 application runtime context。',
    );
  }
  return port;
}

/**
 * 在组件生命周期内注册 dirty source（dirty 判定取组件**最新**值：内部用 ref 持有
 * 最新 source，dirty/message 经惰性闭包读取当前状态，页面改动不重建注册）。
 * 卸载自动取消注册。
 */
export function useRegisterDirtySource(source: PluginDirtySource): void {
  const port = useLeaveConfirmPort();
  const latestRef = useRef(source);
  useLayoutEffect(() => {
    latestRef.current = source;
  });
  useEffect(() => {
    return port.registerDirtySource({
      pageId: latestRef.current.pageId,
      message: () => latestRef.current.message(),
      isDirty: () => latestRef.current.isDirty(),
      ...(latestRef.current.isSubmitting
        ? { isSubmitting: () => latestRef.current.isSubmitting?.() ?? false }
        : {}),
    });
    // 只按 pageId 绑定一次；dirty 判定经 latestRef 读取最新状态。
  }, [port, source.pageId]);
}

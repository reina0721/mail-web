/**
 * Plugin Framework —— Preferences Capability Port（client）。
 *
 * `@community-go/plugin-framework/preferences`：偏好能力的公共契约 + client
 * Provider/context/hook。Host 在 Composition Root 注入完整实现（读
 * `community-go.shell` v1 持久化，见 apps/web Host store）；Plugin（settings）与
 * Shell 经本入口读写同一份偏好，禁止跨 Plugin 直接读 Host store。
 *
 * 设计约束（R107-002）：
 * - 框架只定义**通用 Port 形状**：具体偏好模型（八分类 typed 状态/默认值/校验）由
 *   Product Surface 提供（`@community-go/surface/preferences-model`），结构上满足本
 *   契约；框架不 import surface，保持依赖方向 surface → framework；
 * - 不读 pathname/history；无第二套 Router；
 * - `PersistResult` 让调用方判断成功/可判断失败（损坏/未知版本/存储拒绝/容量不足），
 *   不静默宣称保存成功。
 */

'use client';

/* Library entry同时导出 Provider、Hook，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, type ReactNode } from 'react';

/** 持久化失败原因码（Host storage 层映射；呈现层据码显示恢复动作）。 */
export const PERSIST_FAILURE_CODES = [
  'storage-unavailable',
  'quota',
  'corrupt',
  'unknown-version',
  'write-failed',
] as const;
export type PersistFailureCode = (typeof PERSIST_FAILURE_CODES)[number];

/** 偏好写入/恢复结果：成功或可判断失败（调用方据失败码呈现，不静默覆盖）。 */
export type PersistResult = { ok: true } | { ok: false; code: PersistFailureCode; reason: string };

/**
 * Preferences Port（通用）：Host 注入满足本形状的实现。
 * `Prefs` 为产品偏好模型（八分类对象）；C 为分类 key。
 */
export type PreferencesPort<Prefs> = Readonly<{
  /** 当前完整偏好快照（只读）。 */
  getSnapshot(): Prefs;
  /** 订阅偏好变化；返回取消函数。 */
  subscribe(listener: () => void): () => void;
  /** 分类更新（patch 由产品模型层把关受限联合）；返回持久化结果。 */
  updateCategory<C extends keyof Prefs & string>(
    category: C,
    patch: Partial<Prefs[C]>,
  ): PersistResult;
  /** 恢复单分类默认；返回持久化结果。 */
  resetCategory<C extends keyof Prefs & string>(category: C): PersistResult;
  /** 恢复全部默认（只恢复偏好，不触碰收藏/历史/通知/草稿/筛选方案——Host 实现保证）。 */
  resetAll(): PersistResult;
}>;

const PreferencesContext = createContext<PreferencesPort<unknown> | null>(null);

/** Host 装配 Preferences Port；必须在 Root Provider 中只安装一次。 */
export function PreferencesProvider<Prefs>({
  port,
  children,
}: Readonly<{ port: PreferencesPort<Prefs>; children: ReactNode }>) {
  return <PreferencesContext.Provider value={port}>{children}</PreferencesContext.Provider>;
}

/** 读取 Preferences Port；调用方按产品模型实例化泛型（如 usePreferencesPort<Preferences>()）。 */
export function usePreferencesPort<Prefs>(): PreferencesPort<Prefs> {
  const port = useContext(PreferencesContext);
  if (!port) {
    throw new Error(
      'PreferencesProvider 未安装：Preferences Port 属于 application runtime context。',
    );
  }
  return port as PreferencesPort<Prefs>;
}

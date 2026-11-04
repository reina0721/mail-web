/**
 * Plugin Framework —— Plugin API（Client 侧）。
 *
 * `@community-go/plugin-framework/plugin` 是 Plugin 消费导航/Locale 能力的 Client
 * 子路径。Plugin 页默认按正常 Next 开发方式书写：可用 `next/link`/`useRouter`；
 * `route()`（纯 target）经 `@community-go/plugin-framework/target` 在 Server/Client
 * 均可 import。RouteLink / usePluginNavigation / usePluginLocale 是项目增强
 * 能力（symbolic route、跨 Plugin 稳定引用），委托 Host Navigation/Locale Port，
 * 不替代 Next 原生导航。
 */

'use client';

/* Library entry同时导出 Provider、Hook，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, type ReactNode } from 'react';

import { getSchemaIssues as schemasGetSchemaIssues } from '@community-go/schemas';
import type { RouteTarget } from './target-types';

export type { RouteTarget } from './target-types';
export { route } from './target';
export type { PluginDefinition } from './contract';

/* ------------------------------------------------------------------ */
/* Schemas 能力命名空间（浏览器安全，只 re-export schemas 根入口）         */
/* ------------------------------------------------------------------ */

/** Plugin 消费的 schemas 能力（值命名空间；类型随 /schemas 与根类型导出）。 */
export const schemas = {
  getSchemaIssues: schemasGetSchemaIssues,
} as const;

export type { FoundationSchema, SchemaIssue } from '@community-go/schemas';

/** Plugin 层 Navigation Port：Host 在 Composition Root 注入完整实现。 */
export type PluginNavigationPort = Readonly<{
  /** 将 Target 解析为 href；校验失败时抛错（保持失败语义，不静默）。 */
  resolveHref: (target: RouteTarget) => string;
  navigate: (href: string) => void;
  replace: (href: string) => void;
  renderLink: (props: PluginPortLinkProps) => ReactNode;
}>;

/** Port 内部 Link 渲染契约：href 由 Port 从 Target 解析。 */
export type PluginPortLinkProps = Readonly<{
  href: string;
  target: RouteTarget;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  title?: string;
  onNavigate?: () => void;
  presentation?: 'inline' | 'action';
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}>;

/** Plugin 使用的 Link props：只接收 target，不手写 href。 */
export type PluginLinkProps = Readonly<{
  target: RouteTarget;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  title?: string;
  onNavigate?: () => void;
  presentation?: 'inline' | 'action';
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}>;

export const PluginNavigationContext = createContext<PluginNavigationPort | null>(null);

/** Host 装配 Plugin Navigation Port；必须在 Root Provider 中只安装一次。 */
export function PluginNavigationProvider({
  port,
  children,
}: Readonly<{ port: PluginNavigationPort; children: ReactNode }>) {
  return (
    <PluginNavigationContext.Provider value={port}>{children}</PluginNavigationContext.Provider>
  );
}

function usePluginNavigationPort(): PluginNavigationPort {
  const port = useContext(PluginNavigationContext);
  if (!port) {
    throw new Error(
      'PluginNavigationProvider 未安装：Plugin Navigation Port 属于 application runtime context。',
    );
  }
  return port;
}

/* ------------------------------------------------------------------ */
/* Plugin Locale Port（由 Host capability 注入；Plugin 经 usePluginLocale 读写 locale） */
/* ------------------------------------------------------------------ */

/** Plugin 层 Locale Port：Host 在 Composition Root 注入实现（读写当前 locale）。 */
export type PluginLocalePort = Readonly<{
  locale: string;
  changeLocale: (locale: string) => void;
}>;

export const PluginLocaleContext = createContext<PluginLocalePort | null>(null);

/** Host 装配 Plugin Locale Port；必须在 Root Provider 中只安装一次。 */
export function PluginLocaleProvider({
  port,
  children,
}: Readonly<{ port: PluginLocalePort; children: ReactNode }>) {
  return <PluginLocaleContext.Provider value={port}>{children}</PluginLocaleContext.Provider>;
}

/** 读取当前 locale；读写委托 Host Locale Port。 */
export function usePluginLocale(): PluginLocalePort {
  const port = useContext(PluginLocaleContext);
  if (!port) {
    throw new Error(
      'PluginLocaleProvider 未安装：Plugin Locale Port 属于 application runtime context。',
    );
  }
  return port;
}

/** imperative navigation：navigate(target) / replace(target) 委托 Host Navigation Port。 */
export function usePluginNavigation() {
  const port = usePluginNavigationPort();
  return {
    navigate: (target: RouteTarget) => port.navigate(port.resolveHref(target)),
    replace: (target: RouteTarget) => port.replace(port.resolveHref(target)),
    href: (target: RouteTarget) => port.resolveHref(target),
  } as const;
}

/** RouteLink：渲染真实导航链接，点击委托 Host Navigation Port。 */
export function RouteLink({
  target,
  children,
  className,
  ariaLabel,
  title,
  onNavigate,
  presentation,
  variant,
  size,
  leadingIcon,
  trailingIcon,
}: Readonly<PluginLinkProps>) {
  const port = usePluginNavigationPort();
  const href = port.resolveHref(target);
  return (
    <>
      {port.renderLink({
        href,
        target,
        children,
        ...(className ? { className } : {}),
        ...(ariaLabel ? { ariaLabel } : {}),
        ...(title ? { title } : {}),
        ...(onNavigate ? { onNavigate } : {}),
        ...(presentation ? { presentation } : {}),
        ...(variant ? { variant } : {}),
        ...(size ? { size } : {}),
        ...(leadingIcon ? { leadingIcon } : {}),
        ...(trailingIcon ? { trailingIcon } : {}),
      })}
    </>
  );
}

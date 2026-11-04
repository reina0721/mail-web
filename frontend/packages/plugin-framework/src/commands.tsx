/**
 * Plugin Framework —— Commands Capability（client）。
 *
 * `@community-go/plugin-framework/commands`：命令注册的公共契约 + client
 * Provider/context/hook。Host 注入实现（统一注册表）。
 *
 * 语义（107 设置中心）：
 * - 命令的按钮入口、命令菜单、快捷键与常用操作引用**同一执行函数与可用性**；
 * - 页面/组件卸载时注销，不泄漏；
 * - 无任意键位编辑器（组合固定，见 107 shell-integration）。
 */

'use client';

/* Library entry同时导出 Provider、Hook，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, type ReactNode } from 'react';

/** 命令可用性：available=false 时带原因（按钮/菜单/快捷键呈现禁用原因）。 */
export type CommandAvailability = { available: true } | { available: false; reason: string };

/** 命令作用域（global = 任意页面；page = 仅注册页）。 */
export type CommandScope = 'global' | 'page';

/** 命令注册描述。 */
export type CommandDefinition = Readonly<{
  id: string;
  label: string;
  description: string;
  scope: CommandScope;
  /** 可用性判断（引用同一逻辑，供按钮/菜单/快捷键共用）。 */
  isAvailable(): CommandAvailability;
  run(): void | Promise<void>;
}>;

/** 命令 Port：注册/注销/查询。 */
export type CommandsPort = Readonly<{
  registerCommand(definition: CommandDefinition): () => void;
  /** 列出当前已注册命令（供命令菜单/快捷键层消费）。 */
  listCommands(): readonly CommandDefinition[];
  /** 订阅注册表变化；返回取消函数。 */
  subscribe(listener: () => void): () => void;
  /** 按 id 执行命令（校验可用性；不可用不执行并返回原因）。 */
  runCommand(id: string): { ok: true } | { ok: false; reason: string };
}>;

const CommandsContext = createContext<CommandsPort | null>(null);

/** Host 装配 Commands Port；必须在 Root Provider 中只安装一次。 */
export function CommandsProvider({
  port,
  children,
}: Readonly<{ port: CommandsPort; children: ReactNode }>) {
  return <CommandsContext.Provider value={port}>{children}</CommandsContext.Provider>;
}

/** 读取 Commands Port。 */
export function useCommandsPort(): CommandsPort {
  const port = useContext(CommandsContext);
  if (!port) {
    throw new Error('CommandsProvider 未安装：Commands Port 属于 application runtime context。');
  }
  return port;
}

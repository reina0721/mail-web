/**
 * Plugin Framework —— Host Port / Capability Contract。
 *
 * Host Port 属于 application runtime context，由 Composition Root 一次性安装；
 * Generated Route Entry 不安装 Host Port、不创建 Registry。
 * Host Capability Analysis 在 Host adapter generation 之前执行，按当前 Host
 * Deployment Mode 判定某 Route 是否可承载。Mode 属 Host 构建/部署配置，不属于
 * Plugin Contract——Plugin 始终按正常 Next App Router 开发。
 *
 * Mode 三档（部署能力递增，不是三套 Plugin Route Contract）：
 * - static：output:"export"，只允许构建期确定的静态 URL；
 * - static-enumerated：仍 output:"export"，允许 [param] 动态段，动态 page 须自带
 *   generateStaticParams（Next build 是最终 authority；GS(SP) 检测在 codegen 预检）；
 * - server：真实 Next Runtime Server，动态/request-time 按 Next 原生规则开放。
 */

import type { FileRouteDescriptor } from './contract';
import type { Diagnostic } from './diagnostics';
import { collectDiagnostics } from './diagnostics';
import { hasDynamicSegments } from './registry';
import type { RouteTarget } from './target-types';

/** Host Deployment Mode：部署能力档位（递增）。 */
export type HostDeploymentMode = 'static' | 'static-enumerated' | 'server';

/** 默认 Mode：static（与历史静态导出行为一致）。 */
export const DEFAULT_DEPLOYMENT_MODE: HostDeploymentMode = 'static';

/** 当前 Host Deployment Mode 无法承载该 Route 的 Next 能力（不是 Plugin Route 非法）。 */
export const HOST_MODE_CANNOT_DEPLOY = 'HOST_MODE_CANNOT_DEPLOY';

/** Host 能力分析结果：静态模型，不生成 Host entry。 */
export type HostCapabilityResult = Readonly<{
  /** 无法承载的 Route 列表。 */
  unsupported: readonly FileRouteDescriptor[];
  diagnostics: readonly Diagnostic[];
  /** 是否全部承载（无 unsupported）。 */
  canDeploy: boolean;
}>;

/**
 * 分析给定 Route 集合在当前 Host Deployment Mode 下的承载能力。
 *
 * 只做 mode 级判定（static 禁动态 / server 放行）；static-enumerated 的
 * generateStaticParams 前提由 codegen 预检（需 page 源码，本函数只见 descriptor）。
 * Next build 始终是最终能力判断与生成 authority。
 */
export function analyzeHostCapability(
  routes: readonly FileRouteDescriptor[],
  mode: HostDeploymentMode = DEFAULT_DEPLOYMENT_MODE,
): HostCapabilityResult {
  const unsupported: FileRouteDescriptor[] = [];
  const errors: Diagnostic[] = [];
  for (const descriptor of routes) {
    if (mode !== 'server' && hasDynamicSegments(descriptor.pattern)) {
      unsupported.push(descriptor);
      collectDiagnostics(errors, {
        code: HOST_MODE_CANNOT_DEPLOY,
        routeId: descriptor.routeId,
        message:
          mode === 'static'
            ? `当前 Host Deployment Mode = static 无法承载动态 Route ${descriptor.routeId} (${descriptor.pattern})；请切换 static-enumerated（需 generateStaticParams）或 server。`
            : `当前 Host Deployment Mode = static-enumerated 要求动态 Route ${descriptor.routeId} (${descriptor.pattern}) 自带 generateStaticParams（由 codegen 预检 / Next build 判定）。`,
      });
    }
  }
  return {
    unsupported,
    diagnostics: errors,
    canDeploy: unsupported.length === 0,
  };
}

/**
 * Host Navigation Port 契约。
 *
 * Web Host 在 Root Provider 中一次性安装该 Port；Framework 不读取 pathname、
 * 不创建导航栈、不实现 Router。Plugin 禁止直接使用 Next Link/Router、Browser history
 * 或全局 location 完成应用内导航。
 */
export type HostNavigationPort = Readonly<{
  /** 使用真实 Router 导航到 href。 */
  navigate: (href: string) => void;
  /** 使用真实 Router 替换当前历史项。 */
  replace: (href: string) => void;
}>;

/** Route Target resolver：Host 注入，用于校验与构造 href。 */
export type RouteTargetResolver = Readonly<{
  resolve: (target: RouteTarget) => { href: string; diagnostics: Diagnostic[] };
}>;

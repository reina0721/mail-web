/**
 * Source Path Registry —— **最小**注册表。
 *
 * 只保存 Authority Schema 的显式仓库相对路径（sourceId → 文件路径）。
 * 绝不保存 contractRef、registry path/entry、Artifact、authority metadata
 * 或其它 Authority 信息——它们全部在运行期从 Schema 文档自身解析。
 */

import { resolve } from 'node:path';

export type SourceRegistryEntry = Readonly<{ sourceId: string; schemaPath: string }>;

/** 内建 Source Path Registry（本轮唯一登记：Design System Schema）。 */
export const BUILTIN_SOURCE_PATHS: readonly SourceRegistryEntry[] = [
  {
    sourceId: 'design-system',
    schemaPath: 'packages/design-system/design-system.schema.json',
  },
];

export type SchemaSourceDescriptor = Readonly<{
  sourceId: string;
  /** 相对 workspaceRoot 的 schema 文件路径。 */
  schemaPath: string;
}>;

/** 解析 workspaceRoot 下每个 schema 的绝对路径。 */
export function resolveSchemaPaths(
  workspaceRoot: string,
  descriptors: readonly SchemaSourceDescriptor[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const descriptor of descriptors) {
    const absolute = resolve(workspaceRoot, descriptor.schemaPath);
    map.set(descriptor.sourceId, absolute);
  }
  return map;
}

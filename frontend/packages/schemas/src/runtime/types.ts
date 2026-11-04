/**
 * Schema Runtime —— 类型定义（Authority Schema 协议的类型镜像）。
 *
 * 值只存在于 `x-community-go.source`；facts / artifact mapping 只通过
 * Source Pointer 描述，不保存值副本。本文件只定义运行时消费的结构形态，
 * 不做任何具体 Authority 命名假设。
 */

/** x-community-go 文档（解析后的 Authority Schema 容器）。 */
export type AuthorityDocument = Readonly<{
  $schema: string;
  $id?: string;
  title?: string;
  description?: string;
  $defs?: Readonly<Record<string, unknown>>;
  'x-community-go': AuthorityMeta;
}>;

export type AuthorityMeta = Readonly<{
  protocolVersion: number;
  authorityId: string;
  contractRef: Readonly<{ file: string; pointer: string }>;
  source: unknown;
  facts: readonly Fact[];
  authoring: Readonly<{ patchableSourcePointers: readonly string[] }>;
  artifacts: readonly ArtifactDeclaration[];
}>;

export type Fact = Readonly<{
  id: string;
  description?: string;
  sourcePointer: string;
  implementation?: string;
  evidence?: string;
}>;

/** Artifact 声明：目标文件 + generator + 通用映射信息（不含任何值）。 */
export type ArtifactDeclaration = Readonly<{
  target: string;
  generator: string;
  options?: unknown;
}>;

/** registry-owned 字段（foundation-contracts.json entry），Schema 不得重新声明。 */
export const REGISTRY_OWNED_FIELDS = [
  'layer',
  'owner',
  'maturity',
  'exports',
  'authorityRoutes',
  'evidence',
  'kind',
] as const;

/** 单条 Schema Source 注册（只保存仓库相对路径，其余元数据从文档解析）。 */
export type SchemaSourceSummary = Readonly<{
  sourceId: string;
  schemaPath: string;
  etag: string;
}>;

export type ValidationResult = Readonly<{
  ok: boolean;
  issues: readonly string[];
}>;

export type GenerateResult = Readonly<{
  target: string;
  generator: string;
  ok: boolean;
  error?: string;
}>;

export type FreshnessResult = Readonly<{
  target: string;
  ok: boolean;
  /** 仅 tokens.css 分 region 报告；motion.css 整文件单条。 */
  regions?: ReadonlyArray<{ regionId: string; ok: boolean }>;
  error?: string;
}>;

export type ApplyPatchResult = Readonly<{ etag: string }>;

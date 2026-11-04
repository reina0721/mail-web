/**
 * Plugin Framework —— Schemas Runtime 装配方入口（Node）。
 *
 * `@community-go/plugin-framework/schemas/runtime` 显式接入
 * `@community-go/schemas/runtime` 已公开的 Runtime 工厂、契约与错误类型。
 * Runtime 实例沿用原有公开方法（listSources/readSource/validate/applyPatch/
 * generate/checkFreshness/watch/close）；创建（createSchemaRuntime）与关闭
 * （close）由装配方负责。
 *
 * 边界：
 * - 只 re-export `@community-go/schemas/runtime` 的**公共命名导出**；
 * - 不导出内部用途的 `SOURCE_PATHS`；不访问 schemas 内部文件；
 * - 本入口含 Node 环境要求（schemas/runtime 自身依赖 node:fs 等），
 *   只能由 Node 装配方 import；浏览器入口（./schemas、/plugin）不得 import 本文件。
 */

export {
  createSchemaRuntime,
  SchemaRuntimeError,
  SourceNotFoundError,
  type SchemaRuntime,
  type SchemaRuntimeOptions,
  type SchemaSourceDescriptor,
} from '@community-go/schemas/runtime';

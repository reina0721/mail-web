/**
 * Plugin Framework —— Schemas 能力入口（浏览器安全）。
 *
 * `@community-go/plugin-framework/schemas` 显式转出 `@community-go/schemas`
 * 根入口的公共符号：`FoundationSchema` / `SchemaIssue`（类型）与
 * `getSchemaIssues`（值）。本文件**只 import schemas 公共根入口**，
 * 不访问任何 schemas 内部文件；不 import Node Runtime（schemas 根入口
 * 对 zod 仅 type import，运行时不引入 zod 值）。
 *
 * Node 侧装配方入口在 `@community-go/plugin-framework/schemas/runtime`
 * （见 schemas-runtime.ts）；本文件不得 import 该入口，避免 Node Runtime
 * 进入浏览器产物。
 */

export type { FoundationSchema, SchemaIssue } from '@community-go/schemas';
export { getSchemaIssues } from '@community-go/schemas';

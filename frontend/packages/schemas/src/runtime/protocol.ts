/**
 * Schema Runtime —— 协议校验核心。
 *
 * - Draft 2020-12 schema 语法校验（Ajv 2020 strict；`x-community-go` 经
 *   addVocabulary 正式注册为 extension keyword，**不关闭 strict**）；
 * - 自描述双路：① 文档作为 schema 语法合法；② 文档作为数据，由内建容器
 *   schema（properties['x-community-go'] → `$defs.authorityMeta`）校验
 *   `x-community-go` 实例结构，Source 由 `$defs.authoritySource` 独立编译校验；
 * - 通用 Authority 协议约束：contractRef RFC 6901 转义、registry-owned 字段
 *   不得重新声明、facts 无值且 sourcePointer 指向 source、引用完整性、
 *   patchableSourcePointers 必须位于 source 之下。
 * - 所有 Pointer 语义统一为**文档绝对 RFC 6901 指针**，且必须位于
 *   `/x-community-go/source` 之下。
 */

import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js';

import { JsonPointerError, parsePointer, readPointer } from './json-pointer.ts';
import { REGISTRY_OWNED_FIELDS, type AuthorityDocument, type AuthorityMeta } from './types.ts';

export const PROTOCOL_VERSION = 1;
export const EXTENSION_KEYWORD = 'x-community-go';
export const DEFAULT_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
/** 所有事实/引用/可写区指针必须位于的源区前缀。 */
export const SOURCE_PREFIX = '/x-community-go/source';

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatAjvError(error: ErrorObject): string {
  const where = (error.instancePath ?? '') || '(root)';
  const extra =
    typeof error.params === 'object' && error.params !== null ? JSON.stringify(error.params) : '';
  return `${where}: ${error.message ?? 'unknown'} ${extra}`.trim();
}

function compileStrict(source: unknown): ValidateFunction {
  const ajv = new Ajv2020({
    strict: true,
    strictSchema: true,
    strictTypes: true,
    strictRequired: true,
    allErrors: true,
    validateFormats: false,
  });
  ajv.addVocabulary([EXTENSION_KEYWORD]);
  return ajv.compile(source as Parameters<Ajv2020['compile']>[0]);
}

/**
 * ① 文档作为 JSON Schema Draft 2020-12 语法校验。
 * x-community-go 已注册 extension keyword；其它未知关键字仍 strict fail。
 */
export function validateSchemaSyntax(data: unknown): string[] {
  if (!isRecord(data)) return ['文档必须是 JSON 对象'];
  if (data.$schema !== DEFAULT_SCHEMA_DIALECT) {
    return [`$schema 必须是 ${DEFAULT_SCHEMA_DIALECT}`];
  }
  try {
    const validate = compileStrict(data);
    if (!validate(data)) {
      return (validate.errors ?? []).map(formatAjvError);
    }
  } catch (error) {
    return [`schema 编译失败: ${String(error)}`];
  }
  return [];
}

/**
 * ② 文档作为数据：容器 schema 校验 x-community-go 实例结构。
 * 要求文档必须携带 $defs.authorityMeta 与 $defs.authoritySource。
 */
export function validateMetaShape(data: unknown): string[] {
  if (!isRecord(data)) return ['文档必须是 JSON 对象'];
  const defs = data.$defs;
  if (!isRecord(defs)) return ['文档缺少 $defs'];
  if (!isRecord(defs.authorityMeta)) return ['文档缺少 $defs.authorityMeta'];
  if (!isRecord(defs.authoritySource)) return ['文档缺少 $defs.authoritySource'];

  const container: Record<string, unknown> = {
    $schema: DEFAULT_SCHEMA_DIALECT,
    $defs: defs,
    type: 'object',
    required: [EXTENSION_KEYWORD],
    properties: {
      [EXTENSION_KEYWORD]: { $ref: '#/$defs/authorityMeta' },
    },
    additionalProperties: true,
  };
  try {
    const validate = compileStrict(container);
    if (!validate(data)) {
      return (validate.errors ?? []).map(formatAjvError);
    }
  } catch (error) {
    return [`容器 schema 编译失败: ${String(error)}`];
  }
  return [];
}

function assertNoRegistryOwnedFields(meta: Record<string, unknown>, issues: string[]): void {
  for (const field of REGISTRY_OWNED_FIELDS) {
    if (field in meta) {
      issues.push(`x-community-go 不得重新声明 registry-owned 字段: ${field}`);
    }
  }
}

/** source 内结构化 ref 值必须是文档绝对指针且位于 source 之下。 */
function collectSourceRefs(value: unknown, issues: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceRefs(item, issues);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'ref') {
      if (typeof child !== 'string') {
        issues.push('结构化引用 ref 必须是字符串');
        continue;
      }
      if (!child.startsWith(`${SOURCE_PREFIX}/`)) {
        issues.push(`ref 必须位于 ${SOURCE_PREFIX} 之下: ${child}`);
      } else {
        try {
          parsePointer(child);
        } catch (error) {
          if (error instanceof JsonPointerError) {
            issues.push(`ref 非法: ${child}`);
          }
        }
      }
    }
    collectSourceRefs(child, issues);
  }
}

/** 校验单个 fact。 */
function validateFact(fact: unknown, source: unknown, issues: string[]): void {
  if (!isRecord(fact)) {
    issues.push('fact 必须是对象');
    return;
  }
  const allowed = ['id', 'sourcePointer', 'implementation', 'evidence', 'description'];
  for (const key of Object.keys(fact)) {
    if (!allowed.includes(key)) {
      issues.push(`fact ${String(fact.id)}: 不允许额外字段 ${key}（facts 不保存值副本）`);
    }
  }
  const { id, sourcePointer } = fact;
  if (typeof id !== 'string' || id === '') {
    issues.push('fact id 必须是非空字符串');
    return;
  }
  if (typeof sourcePointer !== 'string') {
    issues.push(`fact ${id}: sourcePointer 必须是字符串`);
    return;
  }
  if (!sourcePointer.startsWith(`${SOURCE_PREFIX}/`)) {
    issues.push(`fact ${id}: sourcePointer 必须位于 ${SOURCE_PREFIX} 之下: ${sourcePointer}`);
    return;
  }
  try {
    parsePointer(sourcePointer);
  } catch (error) {
    if (error instanceof JsonPointerError) {
      issues.push(`fact ${id}: sourcePointer 非法: ${error.message}`);
      return;
    }
  }
  // meta.source 即 /x-community-go/source 节点：截去前缀后保留前导 "/" 再求值。
  const { found } = readPointer(source, sourcePointer.slice(SOURCE_PREFIX.length));
  if (!found) issues.push(`fact ${id}: sourcePointer 悬空: ${sourcePointer}`);
}

/** 深度扫描 artifact 声明中所有 sourcePointer 绑定（只引用、不得内嵌值）。 */
function validateArtifactBindings(node: unknown, issues: string[], pointerPrefix: string): void {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      validateArtifactBindings(node[i], issues, `${pointerPrefix}/${i}`);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const [key, child] of Object.entries(node)) {
    const at = `${pointerPrefix}/${key}`;
    // binding/节点禁止同时携带 sourcePointer 与值字段（mapping 不得内嵌值/fallback）。
    if (isRecord(node) && typeof node.sourcePointer === 'string') {
      for (const valueKey of ['value', 'default', 'fallback', 'literal', 'raw']) {
        if (valueKey in node) {
          issues.push(`${pointerPrefix}: mapping 禁止内嵌 ${valueKey}（Artifact 只引用 Source）`);
        }
      }
    }
    if (key === 'sourcePointer') {
      if (typeof child !== 'string') {
        issues.push(`${at}: sourcePointer 必须是字符串`);
        continue;
      }
      if (!child.startsWith(`${SOURCE_PREFIX}/`)) {
        issues.push(`${at}: sourcePointer 必须位于 ${SOURCE_PREFIX} 之下: ${child}`);
      } else {
        try {
          parsePointer(child);
        } catch (error) {
          if (error instanceof JsonPointerError) {
            issues.push(`${at}: sourcePointer 非法: ${error.message}`);
          }
        }
      }
    }
    validateArtifactBindings(child, issues, at);
  }
}

/**
 * 校验 Authority Schema 文档内容（纯逻辑；registry entry 可选用于交叉核对）。
 * 返回问题列表（空 = 通过）。
 */
export function validateAuthorityDocument(
  data: unknown,
  registryEntry: Readonly<Record<string, unknown>> | undefined,
): string[] {
  const issues: string[] = [];

  // 语法与 meta 结构自描述。
  issues.push(...validateSchemaSyntax(data));
  issues.push(...validateMetaShape(data));

  let meta: AuthorityMeta;
  try {
    meta = (data as Record<string, unknown>)[EXTENSION_KEYWORD] as AuthorityMeta;
  } catch {
    return issues;
  }
  const metaRecord = meta as unknown as Record<string, unknown>;

  if (meta.protocolVersion !== PROTOCOL_VERSION) {
    issues.push(`protocolVersion 必须是 ${PROTOCOL_VERSION}`);
  }
  if (typeof meta.authorityId !== 'string' || meta.authorityId === '') {
    issues.push('authorityId 必须是非空字符串');
  }
  assertNoRegistryOwnedFields(metaRecord, issues);

  // contractRef：file 存在性由 io 层校验；这里校验 RFC 6901 escaping 与语法。
  const contractRef = metaRecord.contractRef as Record<string, unknown> | undefined;
  if (!isRecord(contractRef)) {
    issues.push('contractRef 必须是对象');
  } else {
    if (typeof contractRef.file !== 'string' || contractRef.file === '') {
      issues.push('contractRef.file 必须是非空字符串');
    }
    const pointer = contractRef.pointer;
    if (typeof pointer !== 'string') {
      issues.push('contractRef.pointer 必须是字符串');
    } else if (!pointer.startsWith('/')) {
      issues.push(`contractRef.pointer 必须以 "/" 开头: ${pointer}`);
    } else {
      // RFC 6901 escaping：pointer 必须指向 contracts.<authorityId>；
      // authorityId 含 "/"（如 @community-go/design-system）时必须以 ~1 转义。
      let tokens: string[];
      try {
        tokens = parsePointer(pointer);
      } catch (error) {
        if (error instanceof JsonPointerError) {
          issues.push(`contractRef.pointer 非法: ${error.message}`);
          tokens = [];
        } else {
          throw error;
        }
      }
      if (tokens.length === 2 && tokens[0] === 'contracts') {
        if (tokens[1] !== meta.authorityId) {
          issues.push(`contractRef.pointer 与 authorityId 不匹配: ${pointer}`);
        }
      } else if (tokens.length > 2 && tokens[0] === 'contracts') {
        // 未转义 authorityId 会分裂成多个 token → escaping 缺失。
        const unescaped = tokens.slice(1).join('/');
        if (unescaped === meta.authorityId) {
          issues.push(`contractRef.pointer 必须使用 RFC 6901 escaping: ${pointer}`);
        } else {
          issues.push(`contractRef.pointer 与 authorityId 不匹配: ${pointer}`);
        }
      } else if (tokens.length > 0) {
        issues.push(`contractRef.pointer 必须指向 contracts.<authorityId>: ${pointer}`);
      }
    }
  }

  // registry entry 交叉核对（registryContracts 为 contracts 映射，若提供）。
  if (registryEntry && meta.authorityId) {
    const entry = registryEntry[meta.authorityId];
    if (!entry || !isRecord(entry)) {
      issues.push(`registry entry 与 authorityId 不匹配: ${meta.authorityId}`);
    }
  }

  // facts。
  if (!Array.isArray(meta.facts)) {
    issues.push('facts 必须是数组');
  } else {
    const seenIds = new Set<string>();
    const seenPointers = new Set<string>();
    for (const fact of meta.facts) {
      if (!isRecord(fact)) {
        issues.push('fact 必须是对象');
        continue;
      }
      const rawId = fact.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || seenIds.has(id)) issues.push(`fact id 必须是非空且唯一: ${id}`);
      seenIds.add(id);
      validateFact(fact, meta.source, issues);
      const sp = typeof fact.sourcePointer === 'string' ? fact.sourcePointer : '';
      if (sp && seenPointers.has(sp)) issues.push(`fact sourcePointer 重复: ${sp}`);
      seenPointers.add(sp);
    }
  }

  // artifacts：target/generator 非空且唯一；bindings 只引用。
  if (!Array.isArray(meta.artifacts)) {
    issues.push('artifacts 必须是数组');
  } else {
    const seenTargets = new Set<string>();
    meta.artifacts.forEach((artifact, index) => {
      if (!isRecord(artifact)) {
        issues.push(`artifacts[${index}] 必须是对象`);
        return;
      }
      const { target, generator, options } = artifact;
      if (typeof target !== 'string' || target === '') {
        issues.push(`artifacts[${index}].target 必须是非空字符串`);
      } else {
        if (seenTargets.has(target)) issues.push(`artifact target 重复: ${target}`);
        seenTargets.add(target);
      }
      if (typeof generator !== 'string' || generator === '') {
        issues.push(`artifacts[${index}].generator 必须是非空字符串`);
      }
      if (options !== undefined) {
        validateArtifactBindings(options, issues, `artifacts[${index}].options`);
      }
    });
  }

  // source 内结构化 ref 校验（语法 + 位于 source 之下）。
  collectSourceRefs(meta.source, issues);

  // source 值域禁止 CSS Artifact 表达。
  if (meta.source !== undefined) {
    const sourceJson = JSON.stringify(meta.source);
    if (/var\s*\(/.test(sourceJson)) {
      issues.push('source 内禁止 CSS var() 表达（引用必须结构化 ref）');
    }
    if (/;\s*$/m.test(sourceJson)) {
      issues.push('source 内禁止 CSS declaration 形态');
    }
  }

  // authoring.patchableSourcePointers：文档绝对指针，位于 source 之下。
  const authoring = metaRecord.authoring as Record<string, unknown> | undefined;
  if (!isRecord(authoring) || !Array.isArray(authoring.patchableSourcePointers)) {
    issues.push('authoring.patchableSourcePointers 必须是数组');
  } else {
    for (const pointer of authoring.patchableSourcePointers as unknown[]) {
      if (typeof pointer !== 'string') {
        issues.push('patchableSourcePointers 每项必须是字符串');
        continue;
      }
      if (!pointer.startsWith(`${SOURCE_PREFIX}/`)) {
        issues.push(`patchableSourcePointers 必须位于 ${SOURCE_PREFIX} 之下: ${pointer}`);
      } else {
        try {
          parsePointer(pointer);
        } catch (error) {
          if (error instanceof JsonPointerError) {
            issues.push(`patchableSourcePointers 非法: ${error.message}`);
          }
        }
      }
    }
  }

  return issues;
}

/** 便捷入口。 */
export function validateDocument(
  data: unknown,
  registryEntry: Readonly<Record<string, unknown>> | undefined,
): { ok: boolean; issues: string[] } {
  const issues = validateAuthorityDocument(data, registryEntry);
  return { ok: issues.length === 0, issues };
}

export type { AuthorityDocument };

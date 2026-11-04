/**
 * Schema Runtime —— 统一公共 API。
 *
 * createSchemaRuntime 面向**单个 workspace**（monorepo 内一个前端根目录），
 * 提供：listSources / readSource / validate / applyPatch / generate /
 * checkFreshness / watch / close。
 *
 * - Source Path Registry 只保存 schema 文件路径；authority 元数据从文档解析；
 * - etag 为当前文档内容哈希（并发冲突检测，人工编辑后旧 etag 必冲突）；
 * - Patch 只允许 authoring.patchableSourcePointers 放行的 source 子路径；
 * - generate / checkFreshness 按 artifacts[].generator 调度内置生成器。
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { computeEtag } from './etag.ts';
import { applyPatch as applyRfcPatch, type PatchOperation } from './patch.ts';
import { validateAuthorityDocument } from './protocol.ts';
import {
  readJsonFile,
  assertInsideWorkspace,
  watchFile,
  SchemaIoError,
  type UnwatchFn,
} from './io.ts';
import {
  BUILTIN_SOURCE_PATHS,
  type SchemaSourceDescriptor,
  resolveSchemaPaths,
} from './registry.ts';
import {
  type ApplyPatchResult,
  type AuthorityDocument,
  type FreshnessResult,
  type GenerateResult,
  type SchemaSourceSummary,
  type ValidationResult,
} from './types.ts';
import { readPointer } from './json-pointer.ts';
import {
  applyTokenRegionContents,
  checkTokenRegionFreshness,
  renderRegionContent,
  type RegionDeclaration,
  type TokenRegionsOptions,
} from './generator-token-regions.ts';
import {
  renderMotionCssFile,
  validateMotionLanguageReferences,
  type MotionLanguageOptions,
} from './generator-motion-language.ts';

export type SchemaRuntimeOptions = Readonly<{
  /** workspace 根目录（绝对路径）。 */
  workspaceRoot: string;
  /** 可选覆盖 Source Path Registry（默认 BUILTIN_SOURCE_PATHS）。 */
  sources?: readonly SchemaSourceDescriptor[];
  /** foundation-contracts.json 路径（相对 workspaceRoot）；提供则交叉核对 contractRef。 */
  registryFile?: string;
}>;

export interface SchemaRuntime {
  listSources(): Promise<SchemaSourceSummary[]>;
  readSource(sourceId: string): Promise<AuthorityDocument>;
  validate(sourceId: string): Promise<ValidationResult>;
  applyPatch(
    sourceId: string,
    input: { patch: readonly PatchOperation[]; expectedEtag: string },
  ): Promise<ApplyPatchResult>;
  generate(): Promise<GenerateResult[]>;
  checkFreshness(): Promise<FreshnessResult[]>;
  /** 监听 source schema 变化；listener 收到事件后建议重新 readSource/validate。 */
  watch(sourceId: string, listener: () => void): Promise<UnwatchFn>;
  close(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SchemaIoError(`${what} 必须是对象`);
  return value;
}

export class SchemaRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaRuntimeError';
  }
}

export class SourceNotFoundError extends SchemaRuntimeError {
  constructor(sourceId: string) {
    super(`Schema Source 未注册: ${sourceId}`);
    this.name = 'SourceNotFoundError';
  }
}

export async function createSchemaRuntime(options: SchemaRuntimeOptions): Promise<SchemaRuntime> {
  const workspaceRoot = resolve(options.workspaceRoot);
  const descriptors = options.sources ?? BUILTIN_SOURCE_PATHS;
  const schemaPaths = resolveSchemaPaths(workspaceRoot, descriptors);

  // 预解析 foundation-contracts.json（若提供）供 contractRef 交叉核对。
  let registryContent: Record<string, unknown> | undefined;
  if (options.registryFile) {
    const registryPath = resolve(workspaceRoot, options.registryFile);
    const parsed = await readJsonFile(registryPath);
    const contracts = isRecord(parsed) ? parsed.contracts : undefined;
    registryContent = isRecord(contracts) ? contracts : undefined;
  }

  async function readRawSchema(sourceId: string): Promise<{ raw: unknown; path: string }> {
    const schemaPath = schemaPaths.get(sourceId);
    if (!schemaPath) throw new SourceNotFoundError(sourceId);
    await assertInsideWorkspace(workspaceRoot, schemaPath);
    const raw = await readJsonFile(schemaPath);
    return { raw, path: schemaPath };
  }

  async function readDocument(sourceId: string): Promise<{ doc: AuthorityDocument; etag: string }> {
    const { raw } = await readRawSchema(sourceId);
    const etag = computeEtag(raw);
    return { doc: raw as AuthorityDocument, etag };
  }

  /** 解析 x-community-go 元数据 + 找 registry entry 供协议校验。 */
  async function metaOf(sourceId: string): Promise<{
    meta: Record<string, unknown>;
    doc: unknown;
  }> {
    const { raw } = await readRawSchema(sourceId);
    const root = assertRecord(raw, 'Schema 文档');
    const meta = root['x-community-go'];
    if (!isRecord(meta)) throw new SchemaIoError('Schema 文档缺少 x-community-go');
    return { meta, doc: raw };
  }

  function registryEntryFor(): Record<string, unknown> | undefined {
    // 返回 contracts 映射本身（协议层按 authorityId 交叉核对），无则 undefined。
    return registryContent;
  }

  // 监听方法：按 sourceId 精确监听（防抖 + 串行由 io.watchFile 提供）。
  const watchers = new Map<string, UnwatchFn>();
  const runtime: SchemaRuntime = {
    async listSources() {
      const list: SchemaSourceSummary[] = [];
      for (const [sourceId, schemaPath] of schemaPaths) {
        await assertInsideWorkspace(workspaceRoot, schemaPath);
        const raw = await readJsonFile(schemaPath);
        list.push({ sourceId, schemaPath: schemaPath, etag: computeEtag(raw) });
      }
      return list;
    },

    async readSource(sourceId) {
      const { doc } = await readDocument(sourceId);
      return doc;
    },

    async validate(sourceId) {
      const { meta, doc } = await metaOf(sourceId);
      const entry = registryEntryFor();
      const issues = validateAuthorityDocument(doc, entry);
      // contractRef 指向存在性校验（文件 + pointer）。
      const contractRef = meta.contractRef;
      if (isRecord(contractRef)) {
        const file = contractRef.file;
        const pointer = contractRef.pointer;
        if (typeof file === 'string' && typeof pointer === 'string') {
          const refPath = resolve(workspaceRoot, file);
          try {
            await assertInsideWorkspace(workspaceRoot, refPath);
            const refRaw = await readJsonFile(refPath);
            const { found } = readPointer(refRaw, pointer);
            if (!found) issues.push(`contractRef pointer 指向不存在: ${file} ${pointer}`);
          } catch (error) {
            issues.push(`contractRef file 无法读取: ${file} ${String(error)}`);
          }
        }
      }
      return { ok: issues.length === 0, issues };
    },

    async applyPatch(sourceId, input) {
      const schemaPath = schemaPaths.get(sourceId);
      if (!schemaPath) throw new SourceNotFoundError(sourceId);
      const { raw } = await readRawSchema(sourceId);
      const currentEtag = computeEtag(raw);
      if (currentEtag !== input.expectedEtag) {
        throw new SchemaIoError('etag 冲突：Schema 已被修改（含直接编辑），请重新读取后重试');
      }
      const { meta } = await metaOf(sourceId);
      const authoring = meta.authoring;
      const patchable = Array.isArray(authoring)
        ? []
        : isRecord(authoring) && Array.isArray(authoring.patchableSourcePointers)
          ? (authoring.patchableSourcePointers as string[])
          : [];
      const result = applyRfcPatch(raw, input.patch, patchable, [
        '/x-community-go/contractRef',
        '/x-community-go/facts',
        '/x-community-go/authoring',
        '/x-community-go/artifacts',
        '/x-community-go/protocolVersion',
        '/x-community-go/authorityId',
      ]);
      if (!result.ok) throw new SchemaIoError(`Patch 失败: ${result.error}`);
      const nextRaw = result.data;
      // 修改后重新校验（不合法则不写文件）。
      const entry = registryEntryFor();
      const issues = validateAuthorityDocument(nextRaw, entry);
      if (issues.length > 0) {
        throw new SchemaIoError(`Patch 后校验失败，不写文件: ${issues[0]}`);
      }
      // 原子写回。
      const content = `${JSON.stringify(nextRaw, null, 2)}\n`;
      const dir = dirname(schemaPath);
      await mkdir(dir, { recursive: true });
      const tempPath = join(
        dir,
        `.${schemaPath.split(/[\\/]/).pop()}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`,
      );
      await writeFile(tempPath, content, 'utf8');
      try {
        await rm(schemaPath, { force: true }).catch(() => undefined);
        await import('node:fs/promises').then((m) => m.rename(tempPath, schemaPath));
      } catch (error) {
        await rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
      }
      return { etag: computeEtag(nextRaw) };
    },

    async generate() {
      const results: GenerateResult[] = [];
      for (const sourceId of schemaPaths.keys()) {
        const { raw } = await readRawSchema(sourceId);
        const root = assertRecord(raw, 'Schema 文档');
        const meta = root['x-community-go'];
        if (!isRecord(meta) || !Array.isArray(meta.artifacts)) {
          results.push({
            target: '',
            generator: '',
            ok: false,
            error: `${sourceId}: artifacts 缺失`,
          });
          continue;
        }
        for (const artifact of meta.artifacts as Array<Record<string, unknown>>) {
          const target = artifact.target;
          const generator = artifact.generator;
          const options = artifact.options;
          if (typeof target !== 'string' || typeof generator !== 'string') {
            results.push({
              target: String(target),
              generator: String(generator),
              ok: false,
              error: 'target/generator 非法',
            });
            continue;
          }
          try {
            const absoluteTarget = resolve(workspaceRoot, target);
            await assertInsideWorkspace(workspaceRoot, absoluteTarget);
            if (generator === 'css-token-regions-v1') {
              const opt = options as TokenRegionsOptions | undefined;
              if (!opt || !Array.isArray(opt.regions))
                throw new SchemaIoError('tokens region options 缺失');
              let css = await readFile(absoluteTarget, 'utf8');
              for (const region of opt.regions as RegionDeclaration[]) {
                const content = renderRegionContent(meta.source, region);
                css = applyTokenRegionContents(css, region.regionId, content);
              }
              await writeFile(absoluteTarget, css, 'utf8');
              results.push({ target, generator, ok: true });
            } else if (generator === 'css-motion-language-v1') {
              const opt = options as MotionLanguageOptions | undefined;
              if (!opt) throw new SchemaIoError('motion options 缺失');
              const refIssues = validateMotionLanguageReferences(meta.source, opt);
              if (refIssues.length > 0) {
                throw new SchemaIoError(`Motion Language 引用校验失败: ${refIssues[0]}`);
              }
              const content = renderMotionCssFile(meta.source, opt);
              await writeFile(absoluteTarget, content, 'utf8');
              results.push({ target, generator, ok: true });
            } else {
              results.push({ target, generator, ok: false, error: `未知 generator ${generator}` });
            }
          } catch (error) {
            results.push({ target, generator, ok: false, error: String((error as Error).message) });
          }
        }
      }
      return results;
    },

    async checkFreshness() {
      const results: FreshnessResult[] = [];
      for (const sourceId of schemaPaths.keys()) {
        const { raw } = await readRawSchema(sourceId);
        const root = assertRecord(raw, 'Schema 文档');
        const meta = root['x-community-go'];
        if (!isRecord(meta) || !Array.isArray(meta.artifacts)) {
          results.push({ target: '', ok: false, error: `${sourceId}: artifacts 缺失` });
          continue;
        }
        for (const artifact of meta.artifacts as Array<Record<string, unknown>>) {
          const target = artifact.target;
          const generator = artifact.generator;
          const options = artifact.options;
          if (typeof target !== 'string' || typeof generator !== 'string') {
            results.push({ target: String(target), ok: false, error: 'target/generator 非法' });
            continue;
          }
          try {
            const absoluteTarget = resolve(workspaceRoot, target);
            await assertInsideWorkspace(workspaceRoot, absoluteTarget);
            if (generator === 'css-token-regions-v1') {
              const opt = options as TokenRegionsOptions | undefined;
              if (!opt || !Array.isArray(opt.regions))
                throw new SchemaIoError('tokens region options 缺失');
              const css = await readFile(absoluteTarget, 'utf8');
              const regionResults: { regionId: string; ok: boolean }[] = [];
              let drift: string | null = null;
              for (const region of opt.regions as RegionDeclaration[]) {
                const expected = renderRegionContent(meta.source, region);
                const error = checkTokenRegionFreshness(css, region.regionId, expected);
                regionResults.push({ regionId: region.regionId, ok: error === null });
                if (error && !drift) drift = error;
              }
              results.push({
                target,
                ok: drift === null,
                regions: regionResults,
                ...(drift ? { error: drift } : {}),
              });
            } else if (generator === 'css-motion-language-v1') {
              const opt = options as MotionLanguageOptions | undefined;
              if (!opt) throw new SchemaIoError('motion options 缺失');
              if (!isRecord(meta.source)) throw new SchemaIoError('source 缺失');
              const refIssues = validateMotionLanguageReferences(meta.source, opt);
              if (refIssues.length > 0) {
                results.push({
                  target,
                  ok: false,
                  error: `Motion Language 引用校验失败: ${refIssues[0]}`,
                });
                continue;
              }
              const expected = renderMotionCssFile(meta.source, opt);
              const actual = await readFile(absoluteTarget, 'utf8');
              const ok = actual === expected;
              results.push({ target, ok, ...(ok ? {} : { error: 'motion.css 整文件 drift' }) });
            } else {
              results.push({ target, ok: false, error: `未知 generator ${generator}` });
            }
          } catch (error) {
            results.push({ target, ok: false, error: String((error as Error).message) });
          }
        }
      }
      return results;
    },

    async watch(sourceId: string, listener: () => void): Promise<UnwatchFn> {
      const schemaPath = schemaPaths.get(sourceId);
      if (!schemaPath) throw new SourceNotFoundError(sourceId);
      const unwatch = await watchFile(schemaPath, () => listener(), { debounceMs: 120 });
      watchers.set(sourceId, unwatch);
      return unwatch;
    },

    close() {
      for (const unwatch of watchers.values()) {
        try {
          unwatch();
        } catch {
          // noop
        }
      }
      watchers.clear();
      return Promise.resolve();
    },
  };

  return runtime;
}

/** Source Path Registry（runtime 内部最小注册表；外部不直接消费元数据）。 */
export const SOURCE_PATHS = BUILTIN_SOURCE_PATHS;

export type { SchemaSourceDescriptor };

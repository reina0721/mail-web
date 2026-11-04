/**
 * Generator `css-token-regions-v1` —— tokens.css 受控区段生成器（通用，零 DS 硬编码）。
 *
 * - 完全由 Artifact mapping（options.regions[].bindings[]）驱动：
 *   binding kind 决定数据形态与渲染方式，template 决定输出名称/引用形态；
 *   本文件**不认识** --ds-、--color-、roleOrder、theme、radius 等任何名称；
 * - 只替换 marker 定界区段（`/* @ds-region:<id>:start|end *\/`）内的内容，
 *   marker 外字节**原样保留**：不格式化、不重排（Prettier 不参与本管线）；
 * - marker 缺失 / 重复 / 嵌套 → fail；freshness 逐字节比较受控区段内容；
 * - 受控占位符：{key} {value} {refKey} {doc}；value 一律来自 Source（或 ref 目标）。
 */

import { readPointer } from './json-pointer.ts';

export const TOKEN_REGION_MARKER_PREFIX = '@ds-region:';
/** 文档绝对指针前缀（Source 区）。 */
export const SOURCE_DOC_PREFIX = '/x-community-go/source';

/** 文档绝对指针 → 相对 source 节点的指针（生成器收到的是 /x-community-go/source 节点）。 */
export function toSourceRelativePointer(pointer: string): string {
  if (pointer.startsWith(`${SOURCE_DOC_PREFIX}/`)) {
    return pointer.slice(SOURCE_DOC_PREFIX.length);
  }
  return pointer;
}

export type RegionBinding = Readonly<{
  kind: 'scalar' | 'array' | 'record' | 'keyed' | 'ref' | 'comment';
  shape?: 'literal' | 'ref' | 'documented';
  style?: 'single' | 'align' | 'inline-asterisk' | 'bare-asterisk';
  sourcePointer?: string;
  keysPointer?: string;
  valuesPointer?: string;
  template?: string;
  indent?: number;
}>;

export type RegionDeclaration = Readonly<{ regionId: string; bindings: readonly RegionBinding[] }>;

export type TokenRegionsOptions = Readonly<{ regions: readonly RegionDeclaration[] }>;

export class TokenRegionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenRegionsError';
  }
}

function resolveValue(source: unknown, pointer: string | undefined, context: string): unknown {
  if (!pointer) throw new TokenRegionsError(`${context}: 缺少 sourcePointer`);
  const { found, value } = readPointer(source, toSourceRelativePointer(pointer));
  if (!found) throw new TokenRegionsError(`${context}: Source Pointer 悬空 ${pointer}`);
  return value;
}

function mustBeRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TokenRegionsError(`${context}: 期望 record`);
  }
  return value as Record<string, unknown>;
}

function isLiteralEntry(value: unknown): value is string {
  return typeof value === 'string';
}

function isRefEntry(value: unknown): value is { ref: string; doc?: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { ref?: unknown }).ref === 'string'
  );
}

function isDocumentedEntry(value: unknown): value is { value: string; doc?: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}

function formatDoc(doc: unknown): string {
  if (Array.isArray(doc)) return doc.join('');
  if (typeof doc === 'string') return doc;
  return '';
}

/** 渲染单个 tokenNode（{ ref, doc? }）的 leafKey。 */
function refLeafKey(ref: string): string {
  const tokens = ref.split('/');
  return tokens[tokens.length - 1] ?? '';
}

/** 渲染一个绑定（返回生成的区段行数组；不含区段定界 marker）。 */
export function renderBindingLines(
  source: unknown,
  binding: RegionBinding,
  index: number,
): string[] {
  const context = `binding[${index}]`;
  const indent = binding.indent ?? 0;
  const pad = ' '.repeat(indent);

  if (binding.kind === 'comment') {
    const doc = resolveValue(source, binding.sourcePointer, context);
    const style = binding.style ?? 'single';
    const lines = Array.isArray(doc) ? doc : [String(doc)];
    if (style === 'single') {
      return [lines.map((line) => `${pad}/* ${line} */`).join('\n')];
    }
    if (style === 'align') {
      // 多行对齐注释：首行 "/* <l0>"，续行按内容对齐缩进，末行收 " */"；
      // 标点由 Source doc 自带（l0 结尾 "，"、末行结尾 "。"）。
      const out: string[] = [];
      lines.forEach((line, i) => {
        if (i === 0) out.push(`${pad}/* ${line}`);
        else if (i === lines.length - 1) out.push(`${pad}   ${line} */`);
        else out.push(`${pad}   ${line}`);
      });
      return out;
    }
    if (style === 'inline-asterisk') {
      const out: string[] = [];
      lines.forEach((line, i) => {
        if (i === 0) out.push(`${pad}/* ${line}`);
        else if (i === lines.length - 1) out.push(`${pad} * ${line} */`);
        else out.push(`${pad} * ${line}`);
      });
      return out;
    }
    if (style === 'bare-asterisk') {
      const out: string[] = [];
      out.push(`${pad}/*`);
      for (const line of lines) out.push(`${pad} * ${line}`);
      out.push(`${pad} */`);
      return out;
    }
    throw new TokenRegionsError(`${context}: 未知 comment style ${String(style)}`);
  }

  const template = binding.template ?? '';
  const render = (vars: Record<string, string>): string =>
    template.replace(/\{(key|value|refKey|doc)\}/g, (_m, name: string) => vars[name] ?? '');

  if (binding.kind === 'scalar') {
    const value = String(resolveValue(source, binding.sourcePointer, context));
    return [render({ value })];
  }

  if (binding.kind === 'array') {
    const value = resolveValue(source, binding.sourcePointer, context);
    if (!Array.isArray(value)) throw new TokenRegionsError(`${context}: 期望数组`);
    return value.map((item) => render({ key: String(item), value: String(item) }));
  }

  if (binding.kind === 'record') {
    const value = mustBeRecord(resolveValue(source, binding.sourcePointer, context), context);
    const shape = binding.shape ?? 'literal';
    const lines: string[] = [];
    for (const [key, raw] of Object.entries(value)) {
      if (shape === 'literal') {
        if (!isLiteralEntry(raw)) {
          // 混合 record（如 durationProgress.values 同时含 ref 与 literal 值）：
          // literal shape 只渲染字面量项。
          if (isRefEntry(raw)) continue;
          throw new TokenRegionsError(`${context}: ${key} 不是字面量`);
        }
        lines.push(render({ key, value: raw }));
      } else if (shape === 'ref') {
        if (!isRefEntry(raw)) {
          if (isLiteralEntry(raw)) continue;
          throw new TokenRegionsError(`${context}: ${key} 缺少 ref`);
        }
        const refKey = refLeafKey(raw.ref);
        const doc = raw.doc !== undefined ? formatDoc(raw.doc) : '';
        const vars: Record<string, string> = { key, refKey };
        if (doc) vars.doc = doc;
        lines.push(render(vars));
      } else if (shape === 'documented') {
        if (!isDocumentedEntry(raw)) {
          throw new TokenRegionsError(`${context}: ${key} 缺少 value`);
        }
        const doc = raw.doc !== undefined ? formatDoc(raw.doc) : '';
        const vars: Record<string, string> = { key, value: raw.value };
        if (doc) vars.doc = doc;
        lines.push(render(vars));
      } else {
        throw new TokenRegionsError(`${context}: 未知 record shape ${String(shape)}`);
      }
    }
    return lines;
  }

  if (binding.kind === 'keyed') {
    const keysValue = resolveValue(source, binding.keysPointer, context);
    if (!Array.isArray(keysValue)) throw new TokenRegionsError(`${context}: keysPointer 期望数组`);
    const values = mustBeRecord(resolveValue(source, binding.valuesPointer, context), context);
    return keysValue.map((key) => {
      const k = String(key);
      if (!(k in values)) throw new TokenRegionsError(`${context}: keys 缺值 ${k}`);
      return render({ key: k, value: String(values[k]) });
    });
  }

  if (binding.kind === 'ref') {
    const raw = resolveValue(source, binding.sourcePointer, context);
    const node = mustBeRecord(raw, context);
    if (typeof node.ref !== 'string') throw new TokenRegionsError(`${context}: 缺少 ref`);
    const refKey = refLeafKey(node.ref);
    const doc = node.doc !== undefined ? formatDoc(node.doc) : '';
    const vars: Record<string, string> = { refKey };
    if (doc) vars.doc = doc;
    return [render(vars)];
  }

  throw new TokenRegionsError(`${context}: 未知 binding kind ${String(binding.kind)}`);
}

/** 渲染单个 region 内容（不含 marker 行）。 */
export function renderRegionContent(source: unknown, region: RegionDeclaration): string {
  const lines: string[] = [];
  region.bindings.forEach((binding, index) => {
    lines.push(...renderBindingLines(source, binding, index));
  });
  return lines.join('\n');
}

/** region 定界 marker 行。 */
export function regionStartMarker(regionId: string): string {
  return `/* ${TOKEN_REGION_MARKER_PREFIX}${regionId}:start */`;
}
export function regionEndMarker(regionId: string): string {
  return `/* ${TOKEN_REGION_MARKER_PREFIX}${regionId}:end */`;
}

/** 解析全部 marker 段：返回 { regionId, startLine, endLine }（1-based；end 指向 :end 行）。
 *  要求成对、不嵌套；regionIds 只用于“缺失 region”校验（默认校验全部出现）。 */
export function parseRegionMarkers(
  css: string,
  regionIds?: readonly string[],
): { regionId: string; startLine: number; endLine: number }[] {
  const lines = css.split('\n');
  const result: { regionId: string; startLine: number; endLine: number }[] = [];
  const seen = new Set<string>();
  const startStack: { regionId: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const startMatch = /\/\*\s*@ds-region:([a-z0-9-]+):start\s*\*\//.exec(line);
    const endMatch = /\/\*\s*@ds-region:([a-z0-9-]+):end\s*\*\//.exec(line);
    if (startMatch) {
      const id = startMatch[1] ?? '';
      if (seen.has(id)) throw new TokenRegionsError(`region marker 重复: ${id}`);
      if (startStack.length > 0) throw new TokenRegionsError(`region marker 嵌套: ${id}`);
      seen.add(id);
      startStack.push({ regionId: id, line: i + 1 });
    }
    if (endMatch) {
      const id = endMatch[1] ?? '';
      const start = startStack.pop();
      if (!start || start.regionId !== id) {
        throw new TokenRegionsError(`region marker 不匹配: ${id}`);
      }
      result.push({ regionId: id, startLine: start.line, endLine: i + 1 });
    }
  }
  if (startStack.length > 0) {
    throw new TokenRegionsError(`region marker 缺少 end: ${startStack[0]?.regionId}`);
  }
  // 缺失 region → fail。
  for (const id of regionIds ?? []) {
    if (!seen.has(id)) throw new TokenRegionsError(`region marker 缺失: ${id}`);
  }
  return result;
}

/** 只替换受控区段；marker 外内容原样保留。 */
export function applyTokenRegionContents(
  css: string,
  regionId: string,
  newContent: string,
): string {
  const markers = parseRegionMarkers(css, [regionId]);
  const marker = markers.find((m) => m.regionId === regionId);
  if (!marker) throw new TokenRegionsError(`region 未找到: ${regionId}`);
  const lines = css.split('\n');
  const trailingNewline = css.endsWith('\n');
  // start marker 行（含）之前 + start 行 + 新内容 + end 行 + end 行之后。
  const prefix = lines.slice(0, marker.startLine);
  const suffix = lines.slice(marker.endLine - 1);
  const contentLines = newContent === '' ? [] : newContent.split('\n');
  const rebuilt = [...prefix, ...contentLines, ...suffix].join('\n');
  return trailingNewline && !rebuilt.endsWith('\n') ? `${rebuilt}\n` : rebuilt;
}

/** 校验区段内容与 Source 一致性（freshness）。返回不一致描述或 null。 */
export function checkTokenRegionFreshness(
  css: string,
  regionId: string,
  expectedContent: string,
): string | null {
  const markers = parseRegionMarkers(css, [regionId]);
  const marker = markers.find((m) => m.regionId === regionId);
  if (!marker) return `region 未找到: ${regionId}`;
  const lines = css.split('\n');
  const contentLines = lines.slice(marker.startLine, marker.endLine - 1);
  const actual = contentLines.join('\n');
  if (actual !== expectedContent) {
    return `region ${regionId} 内容漂移`;
  }
  return null;
}

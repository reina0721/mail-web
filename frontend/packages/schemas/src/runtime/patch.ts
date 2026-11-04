/**
 * RFC 6902 JSON Patch —— 纯实现（无第三方依赖），带 Authority 只读边界。
 *
 * 可写性模型：**白名单优先**。调用方传 `patchablePointers`（RFC 6901 前缀，
 * 来自 `x-community-go.authoring.patchableSourcePointers`）；任何写操作
 * （add/remove/replace/move/copy）的目标或移动来源，其完整路径必须位于某个
 * patchable 前缀之下，否则整次 Patch 失败。另可传 `readOnlyPointers`
 * （协议结构等绝对保护前缀）作为叠加黑名单。
 * 校验先于执行：先在克隆上逐个执行全部 op；任何 op 失败 → 返回原文档与错误，
 * 绝不写入（无部分应用）。move/copy 的 source 与 destination 任一侧越权均失败。
 */

import {
  ARRAY_APPEND_TOKEN,
  JsonPointerError,
  evaluatePointer,
  joinPointerTokens,
  parsePointer,
} from './json-pointer.ts';

export type PatchOperation = Readonly<{
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  from?: string;
  value?: unknown;
}>;

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 深度克隆（JSON 安全值）。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** pointer 是否位于某个前缀之下（等于前缀或以其为祖先）。 */
function isUnder(tokens: readonly string[], prefixes: readonly string[]): boolean {
  const pointer = joinPointerTokens(tokens);
  return prefixes.some(
    (prefix) => pointer === prefix || pointer.startsWith(prefix === '' ? '/' : `${prefix}/`),
  );
}

/** 可写判定：位于 patchable 白名单之下，且不落在 readOnly 黑名单。 */
function isWritable(
  tokens: readonly string[],
  patchable: readonly string[],
  readOnly: readonly string[],
): boolean {
  return isUnder(tokens, patchable) && !isUnder(tokens, readOnly);
}

function assertPathExists(target: unknown, tokens: readonly string[]): void {
  const exists = (() => {
    try {
      const pointer = joinPointerTokens(tokens);
      void evaluatePointer(target, pointer);
      return true;
    } catch (error) {
      if (error instanceof JsonPointerError) return false;
      throw error;
    }
  })();
  if (!exists) {
    throw new PatchError(`Path 不存在: ${joinPointerTokens(tokens)}`);
  }
}

/** 取“目标指针的父级路径”前缀（move/copy 需要在父级做插入）。 */
function parentTokens(tokens: readonly string[]): readonly string[] {
  return tokens.slice(0, -1);
}

function parentOf(target: unknown, tokens: readonly string[]): unknown {
  if (tokens.length === 0) {
    throw new PatchError('根节点不可作为 add/remove 目标');
  }
  const parentPath = parentTokens(tokens);
  return evaluatePointer(target, joinPointerTokens(parentPath));
}

function resolveParentKey(
  target: unknown,
  tokens: readonly string[],
): { parent: unknown; key: string | number; append: boolean } {
  const last = tokens[tokens.length - 1] ?? '';
  if (last === ARRAY_APPEND_TOKEN) {
    const parent = parentOf(target, tokens);
    if (!Array.isArray(parent)) throw new PatchError(`"-" 只能用于数组追加`);
    return { parent, key: parent.length, append: true };
  }
  const parent = parentOf(target, tokens);
  if (Array.isArray(parent)) {
    if (!/^(?:0|[1-9]\d*)$/.test(last)) throw new PatchError(`数组索引非法: ${last}`);
    const index = Number(last);
    if (index > parent.length) throw new PatchError(`数组索引越界: ${last}`);
    return { parent, key: index, append: false };
  }
  if (!isPlainObject(parent)) throw new PatchError(`Path 父级不是容器`);
  return { parent, key: last, append: false };
}

function applyAdd(
  target: unknown,
  tokens: readonly string[],
  value: unknown,
  patchable: readonly string[],
  readOnly: readonly string[],
): void {
  if (!isWritable(tokens, patchable, readOnly)) {
    throw new PatchError(`越权（不可写区域）: ${joinPointerTokens(tokens)}`);
  }
  const { parent, key, append } = resolveParentKey(target, tokens);
  if (Array.isArray(parent)) {
    if (append) {
      parent.push(clone(value));
    } else {
      parent.splice(Number(key), 0, clone(value));
    }
    return;
  }
  const record = parent as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    throw new PatchError(`add 目标已存在: ${joinPointerTokens(tokens)}`);
  }
  record[key] = clone(value);
}

function applyRemove(
  target: unknown,
  tokens: readonly string[],
  patchable: readonly string[],
  readOnly: readonly string[],
): void {
  if (tokens.length === 0) throw new PatchError('不能 remove 根节点');
  if (!isWritable(tokens, patchable, readOnly)) {
    throw new PatchError(`越权（不可写区域）: ${joinPointerTokens(tokens)}`);
  }
  assertPathExists(target, tokens);
  const parent = parentOf(target, tokens);
  if (Array.isArray(parent)) {
    parent.splice(Number(tokens[tokens.length - 1]), 1);
    return;
  }
  if (isPlainObject(parent)) {
    delete parent[tokens[tokens.length - 1] ?? ''];
    return;
  }
  throw new PatchError(`Path 父级不是容器`);
}

function applyReplace(
  target: unknown,
  tokens: readonly string[],
  value: unknown,
  patchable: readonly string[],
  readOnly: readonly string[],
): void {
  if (tokens.length === 0) throw new PatchError('不能 replace 根节点');
  if (!isWritable(tokens, patchable, readOnly)) {
    throw new PatchError(`越权（不可写区域）: ${joinPointerTokens(tokens)}`);
  }
  assertPathExists(target, tokens);
  const { parent, key } = resolveParentKey(target, tokens);
  (parent as Record<string | number, unknown>)[key] = clone(value);
}

/** remove 一段（move/copy 的 source 侧）。 */
function removeAt(target: unknown, tokens: readonly string[]): unknown {
  const removed = evaluatePointer(target, joinPointerTokens(tokens));
  const parent = parentOf(target, tokens);
  if (Array.isArray(parent)) {
    parent.splice(Number(tokens[tokens.length - 1]), 1);
  } else if (isPlainObject(parent)) {
    delete parent[tokens[tokens.length - 1] ?? ''];
  }
  return removed;
}

function insertAt(target: unknown, tokens: readonly string[], value: unknown): void {
  const { parent, key, append } = resolveParentKey(target, tokens);
  if (Array.isArray(parent)) {
    if (append) {
      parent.push(value);
    } else {
      parent.splice(Number(key), 0, value);
    }
    return;
  }
  const record = parent as Record<string, unknown>;
  record[key] = value;
}

/** 校验一个 patch（引用完整性等）；失败抛 PatchError。 */
export function assertPatchShape(patch: unknown): asserts patch is readonly PatchOperation[] {
  if (!Array.isArray(patch)) throw new PatchError('Patch 必须是数组');
  for (const operation of patch) {
    if (!isPlainObject(operation)) throw new PatchError('每个 op 必须是对象');
    const op = operation.op;
    if (
      typeof op !== 'string' ||
      !['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(op)
    ) {
      throw new PatchError(`未知 op: ${String(op)}`);
    }
    if (typeof operation.path !== 'string') throw new PatchError('op.path 必须是字符串');
    // path 必须可解析（RFC 6901 语法），此处只验证语法。
    parsePointer(operation.path);
    if ((op === 'move' || op === 'copy') && typeof operation.from !== 'string') {
      throw new PatchError(`${op} 缺少 from`);
    }
    if (op === 'move' && operation.from === operation.path) {
      throw new PatchError('move from 与 path 相同');
    }
  }
}

/**
 * 应用 RFC 6902 Patch。任何失败返回 { ok:false }（不部分应用）。
 * @param patchablePointers 白名单前缀（写操作目标/来源必须位于其下）。
 * @param readOnlyPointers  叠加黑名单前缀（协议结构等绝对保护）。
 */
export function applyPatch(
  data: unknown,
  patch: readonly PatchOperation[],
  patchablePointers: readonly string[] = [''],
  readOnlyPointers: readonly string[] = [],
): { ok: true; data: unknown } | { ok: false; error: string } {
  const working = clone(data);
  for (const operation of patch) {
    let tokens: string[];
    let fromTokens: string[] | undefined;
    try {
      tokens = parsePointer(operation.path);
      fromTokens = operation.from !== undefined ? parsePointer(operation.from) : undefined;
    } catch (error) {
      if (error instanceof JsonPointerError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
    try {
      switch (operation.op) {
        case 'add': {
          applyAdd(working, tokens, operation.value, patchablePointers, readOnlyPointers);
          break;
        }
        case 'remove': {
          applyRemove(working, tokens, patchablePointers, readOnlyPointers);
          break;
        }
        case 'replace': {
          applyReplace(working, tokens, operation.value, patchablePointers, readOnlyPointers);
          break;
        }
        case 'move': {
          const from = fromTokens as readonly string[];
          if (from.length === 0) throw new PatchError('move 不能移动根节点');
          // move 的语义 = remove(source) + add(dest)：两侧都必须可写。
          if (!isWritable(from, patchablePointers, readOnlyPointers)) {
            throw new PatchError(`move 来源越权: ${joinPointerTokens(from)}`);
          }
          if (!isWritable(tokens, patchablePointers, readOnlyPointers)) {
            throw new PatchError(`move 目标越权: ${joinPointerTokens(tokens)}`);
          }
          assertPathExists(working, from);
          const moved = removeAt(working, from);
          insertAt(working, tokens, moved);
          break;
        }
        case 'copy': {
          const from = fromTokens as readonly string[];
          if (!isWritable(from, patchablePointers, readOnlyPointers)) {
            throw new PatchError(`copy 来源越权: ${joinPointerTokens(from)}`);
          }
          if (!isWritable(tokens, patchablePointers, readOnlyPointers)) {
            throw new PatchError(`copy 目标越权: ${joinPointerTokens(tokens)}`);
          }
          const copied = clone(evaluatePointer(working, joinPointerTokens(from)));
          insertAt(working, tokens, copied);
          break;
        }
        case 'test': {
          const actual = evaluatePointer(working, joinPointerTokens(tokens));
          if (JSON.stringify(actual) !== JSON.stringify(operation.value)) {
            throw new PatchError(`test 失败: ${joinPointerTokens(tokens)}`);
          }
          break;
        }
      }
    } catch (error) {
      if (error instanceof PatchError || error instanceof JsonPointerError) {
        return { ok: false, error: error.message };
      }
      return { ok: false, error: `Patch 执行异常: ${String(error)}` };
    }
  }
  return { ok: true, data: working };
}

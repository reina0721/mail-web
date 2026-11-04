/**
 * RFC 6901 JSON Pointer —— 纯实现（无第三方依赖）。
 *
 * 只负责 Pointer 的解析、转义、求值；不携带任何 Authority 语义。
 * contractRef 等所有 Pointer 字段都必须使用标准 RFC 6901 escaping
 * （`~1` 表示 `/`，`~0` 表示 `~`）。
 */

export class JsonPointerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonPointerError';
  }
}

/** 转义单个引用 token（RFC 6901 §3：先 ~0 后 ~1，顺序固定）。 */
export function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** 反转义单个引用 token。 */
export function unescapePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** 把 tokens 序列化为标准 Pointer 字符串（根为 ""）。 */
export function joinPointerTokens(tokens: readonly string[]): string {
  if (tokens.length === 0) return '';
  return `/${tokens.map(escapePointerToken).join('/')}`;
}

/** 解析 Pointer 字符串为未转义 token 序列。非法形式抛 JsonPointerError。 */
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new JsonPointerError(`Pointer 必须以 "/" 开头: ${pointer}`);
  }
  const tokens = pointer.slice(1).split('/');
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    // 先反转义 ~1 再反转义 ~0，避免 "~01" 类歧义（RFC 6901 要求）。
    if (token.includes('~')) {
      tokens[i] = unescapePointerToken(token);
    }
  }
  return tokens;
}

function isArrayIndex(token: string): boolean {
  // RFC 6901 数组 index：0 或非零无前导零十进制。
  if (!/^(?:0|[1-9]\d*)$/.test(token)) return false;
  const value = Number(token);
  return Number.isSafeInteger(value);
}

/** 定位当前值（已含 parent 的 target 为 target.parent）。 */
function locate(
  data: unknown,
  tokens: readonly string[],
): { parent: unknown; key: string | number; exists: boolean } {
  let current: unknown = data;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i] ?? '';
    if (Array.isArray(current)) {
      if (!isArrayIndex(token)) {
        throw new JsonPointerError(`数组索引非法: ${token}`);
      }
      const index = Number(token);
      if (index >= current.length) {
        throw new JsonPointerError(`Pointer 越界: ${joinPointerTokens(tokens.slice(0, i + 1))}`);
      }
      current = current[index];
    } else if (current !== null && typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, token)) {
        throw new JsonPointerError(
          `Pointer 目标不存在: ${joinPointerTokens(tokens.slice(0, i + 1))}`,
        );
      }
      current = record[token];
    } else {
      throw new JsonPointerError(
        `Pointer 中间节点不是容器: ${joinPointerTokens(tokens.slice(0, i + 1))}`,
      );
    }
  }
  const last = tokens[tokens.length - 1];
  if (tokens.length === 0) return { parent: undefined, key: '', exists: true };
  if (Array.isArray(current)) {
    if (last === ARRAY_APPEND_TOKEN) {
      return { parent: current, key: current.length, exists: false };
    }
    if (!isArrayIndex(last ?? '')) {
      throw new JsonPointerError(`数组索引非法: ${last}`);
    }
    const index = Number(last);
    if (index >= current.length) {
      throw new JsonPointerError(
        `Pointer 越界: ${joinPointerTokens(tokens)}（数组长度 ${current.length}）`,
      );
    }
    return {
      parent: current,
      key: index,
      exists: index < current.length && Object.prototype.hasOwnProperty.call(current, index),
    };
  }
  if (current !== null && typeof current === 'object') {
    const record = current as Record<string, unknown>;
    return {
      parent: current,
      key: last ?? '',
      exists: Object.prototype.hasOwnProperty.call(record, last ?? ''),
    };
  }
  throw new JsonPointerError(`Pointer 求值失败: ${joinPointerTokens(tokens)}`);
}

/** 求值 Pointer；目标不存在抛 JsonPointerError。 */
export function evaluatePointer(data: unknown, pointer: string): unknown {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return data;
  const { parent, key } = locate(data, tokens);
  return (parent as Record<string | number, unknown>)[key];
}

/** 判断 Pointer 是否指向已存在节点。 */
export function hasPointer(data: unknown, pointer: string): boolean {
  try {
    const tokens = parsePointer(pointer);
    if (tokens.length === 0) return true;
    const { exists } = locate(data, tokens);
    return exists;
  } catch {
    return false;
  }
}

/** 返回 Pointer 指向节点存在与否 + 值（用于解析时区分“不存在”与“值为 undefined”场景）。 */
export function readPointer(data: unknown, pointer: string): { found: boolean; value: unknown } {
  try {
    const tokens = parsePointer(pointer);
    if (tokens.length === 0) return { found: true, value: data };
    const { parent, key, exists } = locate(data, tokens);
    if (!exists) return { found: false, value: undefined };
    return { found: true, value: (parent as Record<string | number, unknown>)[key] };
  } catch (error) {
    if (error instanceof JsonPointerError) return { found: false, value: undefined };
    throw error;
  }
}

/** 数组追加 token "-"。 */
export const ARRAY_APPEND_TOKEN = '-';

/**
 * Schema etag —— Runtime 内容哈希并发版本。
 *
 * Authority Schema 文件本身**不携带**自增 revision（人工可绕过）；
 * 并发冲突检测使用"当前 Schema 内容"的稳定哈希（etag）：
 * - 手工直接编辑文件（哪怕只读区）会改变内容哈希，旧客户端携带旧 etag
 *   提交 Patch 必然冲突；
 * - 键顺序不扰动 etag（canonical 序列化按键排序），值/结构变化扰动。
 */

import { createHash } from 'node:crypto';

/** 递归按键排序后的稳定可序列化值（数组保序；对象键排序）。 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

/** 稳定序列化（JSON.stringify canonical 值）。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** 计算 Schema 文档 etag（sha256 of canonical JSON）。 */
export function computeEtag(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

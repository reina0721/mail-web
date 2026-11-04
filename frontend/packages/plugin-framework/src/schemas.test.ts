// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getSchemaIssues, type FoundationSchema, type SchemaIssue } from '@community-go/schemas';

import {
  getSchemaIssues as pluginGetSchemaIssues,
  type FoundationSchema as PluginFoundationSchema,
  type SchemaIssue as PluginSchemaIssue,
} from './schemas';

const here = dirname(fileURLToPath(import.meta.url));

describe('plugin-framework/schemas（浏览器安全入口）', () => {
  it('getSchemaIssues 与 schemas 根入口为同一函数引用（identity）', () => {
    expect(pluginGetSchemaIssues).toBe(getSchemaIssues);
  });

  it('SchemaIssue 类型可消费（与根入口同构）', () => {
    // 编译断言：声明与赋值。
    const issue: SchemaIssue = { path: ['name'], code: 'too_small' };
    const pluginIssue: PluginSchemaIssue = issue;
    expect(pluginIssue.code).toBe('too_small');
  });

  it('FoundationSchema 类型可消费（与根入口同构）', () => {
    // 编译断言：FoundationSchema<Output> 收口 zod schema。
    const schema: FoundationSchema<{ name: string }> = z.object({ name: z.string().min(2) });
    const pluginSchema: PluginFoundationSchema<{ name: string }> = schema;
    expect(pluginSchema).toBe(schema);
  });

  it('真实 ZodError 经 getSchemaIssues 提取结构化 issue（语义原样）', () => {
    const schema: FoundationSchema<{ name: string }> = z.object({ name: z.string().min(2) });
    const result = schema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues: readonly SchemaIssue[] = pluginGetSchemaIssues(result.error);
      expect([...issues]).toEqual([{ path: ['name'], code: 'too_small' }]);
    }
  });

  it('浏览器入口源码不 import Node Runtime 或 schemas 内部路径', async () => {
    const source = await readFile(join(here, 'schemas.ts'), 'utf8');
    expect(source).not.toMatch(/node:/);
    expect(source).not.toMatch(/@community-go\/schemas\/runtime/);
    expect(source).not.toMatch(/@community-go\/schemas\/src\//);
    expect(source).not.toMatch(/packages\/schemas\/src/);
    expect(source).not.toMatch(/SOURCE_PATHS/);
  });

  it('plugin 入口（/plugin）源码不含 Node Runtime 且 schemas 命名空间只来自根入口', async () => {
    const source = await readFile(join(here, 'plugin.tsx'), 'utf8');
    expect(source).not.toMatch(/node:/);
    expect(source).not.toMatch(/@community-go\/schemas\/runtime/);
    expect(source).not.toMatch(/schemas-runtime/);
  });
});

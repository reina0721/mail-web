import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  createSchemaRuntime,
  SchemaRuntimeError,
  SourceNotFoundError,
  type SchemaRuntime,
  type SchemaRuntimeOptions,
  type SchemaSourceDescriptor,
} from '@community-go/schemas/runtime';

import * as pluginSchemasRuntime from './schemas-runtime';

const here = dirname(fileURLToPath(import.meta.url));

describe('plugin-framework/schemas/runtime（Node 装配方入口）', () => {
  it('工厂与错误类与 schemas/runtime 公共导出同引用（identity）', () => {
    expect(pluginSchemasRuntime.createSchemaRuntime).toBe(createSchemaRuntime);
    expect(pluginSchemasRuntime.SchemaRuntimeError).toBe(SchemaRuntimeError);
    expect(pluginSchemasRuntime.SourceNotFoundError).toBe(SourceNotFoundError);
  });

  it('错误语义原样：SourceNotFoundError 继承 SchemaRuntimeError，均为 Error', () => {
    expect(SchemaRuntimeError.prototype).toBeInstanceOf(Error);
    expect(SourceNotFoundError.prototype).toBeInstanceOf(SchemaRuntimeError);
  });

  it('契约类型可消费（SchemaRuntime/SchemaRuntimeOptions/SchemaSourceDescriptor）', () => {
    // 编译断言：方法签名原样（不复制、不深 import 内部类型）。
    const runtimeMethods: (keyof SchemaRuntime)[] = [
      'listSources',
      'readSource',
      'validate',
      'applyPatch',
      'generate',
      'checkFreshness',
      'watch',
      'close',
    ];
    expect(runtimeMethods).toContain('close');
    const options: SchemaRuntimeOptions = {
      workspaceRoot: '/tmp/workspace',
      registryFile: 'tooling/foundation-contracts.json',
    };
    expect(options.workspaceRoot).toBe('/tmp/workspace');
    const descriptor: SchemaSourceDescriptor = {
      sourceId: 'x',
      schemaPath: 'packages/x/schema.json',
    };
    expect(descriptor.sourceId).toBe('x');
  });

  it('不导出内部用途 SOURCE_PATHS', () => {
    const exportedKeys = Object.keys(pluginSchemasRuntime);
    expect(exportedKeys).not.toContain('SOURCE_PATHS');
  });

  it('Node 入口源码不访问 schemas 内部文件路径', async () => {
    const source = await readFile(join(here, 'schemas-runtime.ts'), 'utf8');
    expect(source).not.toMatch(/@community-go\/schemas\/src\//);
    expect(source).not.toMatch(/packages\/schemas\/src/);
    // 只 re-export 公共子路径。
    expect(source).toMatch(/@community-go\/schemas\/runtime/);
  });
});

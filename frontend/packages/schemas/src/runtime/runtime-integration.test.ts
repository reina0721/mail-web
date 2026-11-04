import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeEtag } from './etag';
import { createSchemaRuntime } from './index';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const realSchemaPath = join(frontendRoot, 'packages', 'design-system', 'design-system.schema.json');
const realTokensPath = join(frontendRoot, 'packages', 'design-system', 'src', 'tokens.css');
const realMotionPath = join(frontendRoot, 'packages', 'design-system', 'src', 'motion.css');

/** 复制真实 Schema 到临时 workspace（验证不触碰真实文件）。 */
async function copySchemaFixture(workspace: string) {
  const content = await readFile(realSchemaPath, 'utf8');
  const dir = join(workspace, 'packages', 'design-system');
  await import('node:fs/promises').then((m) => m.mkdir(dir, { recursive: true }));
  await writeFile(join(dir, 'design-system.schema.json'), content, 'utf8');
  return join(dir, 'design-system.schema.json');
}

async function copyCssFixtures(workspace: string) {
  const dir = join(workspace, 'packages', 'design-system', 'src');
  await import('node:fs/promises').then((m) => m.mkdir(dir, { recursive: true }));
  await writeFile(join(dir, 'tokens.css'), await readFile(realTokensPath, 'utf8'), 'utf8');
  await writeFile(join(dir, 'motion.css'), await readFile(realMotionPath, 'utf8'), 'utf8');
}

describe('Schema Runtime 集成（临时 workspace + 真实 fixture）', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'schema-runtime-'));
    const schemaFile = await copySchemaFixture(workspace);
    await copyCssFixtures(workspace);
    // 复制 registry 相对路径文件。
    const toolingDir = join(workspace, 'tooling');
    await import('node:fs/promises').then((m) => m.mkdir(toolingDir, { recursive: true }));
    const registryContent = await readFile(
      join(frontendRoot, 'tooling', 'foundation-contracts.json'),
      'utf8',
    );
    await writeFile(join(toolingDir, 'foundation-contracts.json'), registryContent, 'utf8');
    void schemaFile;
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('listSources / readSource / validate 通过', async () => {
    const runtime = await createSchemaRuntime({
      workspaceRoot: workspace,
      registryFile: 'tooling/foundation-contracts.json',
    });
    try {
      const list = await runtime.listSources();
      expect(list).toHaveLength(1);
      expect(list[0]?.sourceId).toBe('design-system');
      const doc = await runtime.readSource('design-system');
      const meta = doc['x-community-go'] as Record<string, unknown>;
      expect(meta.authorityId).toBe('@community-go/design-system');
      const result = await runtime.validate('design-system');
      expect(result.ok).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it('generate / checkFreshness 通过（真实 token/motion CSS）', async () => {
    const runtime = await createSchemaRuntime({
      workspaceRoot: workspace,
      registryFile: 'tooling/foundation-contracts.json',
    });
    try {
      const freshness = await runtime.checkFreshness();
      expect(freshness.map((f) => ({ target: f.target, ok: f.ok }))).toEqual([
        { target: 'packages/design-system/src/tokens.css', ok: true },
        { target: 'packages/design-system/src/motion.css', ok: true },
      ]);
      const results = await runtime.generate();
      expect(results.every((r) => r.ok)).toBe(true);
      const freshness2 = await runtime.checkFreshness();
      expect(freshness2.every((f) => f.ok)).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it('手工编辑 tokens.css 受控区段 → freshness 失败；重新生成恢复', async () => {
    const runtime = await createSchemaRuntime({
      workspaceRoot: workspace,
      registryFile: 'tooling/foundation-contracts.json',
    });
    try {
      const cssPath = join(workspace, 'packages/design-system/src/tokens.css');
      const css = await readFile(cssPath, 'utf8');
      await writeFile(
        cssPath,
        css.replace('--ds-canvas: #f6f7fb;', '--ds-canvas: #000000;'),
        'utf8',
      );
      const freshness = await runtime.checkFreshness();
      const tokens = freshness.find((f) => f.target.includes('tokens.css'))!;
      expect(tokens.ok).toBe(false);
      await runtime.generate();
      const freshness2 = await runtime.checkFreshness();
      expect(freshness2.every((f) => f.ok)).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it('etag：直接编辑 Schema 后旧 etag Patch 必冲突；新 etag Patch 成功且写回', async () => {
    const runtime = await createSchemaRuntime({
      workspaceRoot: workspace,
      registryFile: 'tooling/foundation-contracts.json',
    });
    try {
      const schemaFile = join(workspace, 'packages/design-system/design-system.schema.json');
      const doc = JSON.parse(await readFile(schemaFile, 'utf8')) as Record<string, unknown>;
      const meta = doc['x-community-go'] as {
        source: { tokens: { theme: { radii: Record<string, string> } } };
      };
      const etagBefore = computeEtag(doc);
      // 直接手工改一个可写值（绕过 runtime）。
      meta.source.tokens.theme.radii.control = '0.5rem';
      await writeFile(schemaFile, JSON.stringify(doc, null, 2), 'utf8');

      // 旧 etag（编辑前）→ 冲突。
      await expect(
        runtime.applyPatch('design-system', {
          patch: [
            {
              op: 'replace',
              path: '/x-community-go/source/tokens/theme/radii/control',
              value: '2rem',
            },
          ],
          expectedEtag: etagBefore,
        }),
      ).rejects.toThrow('etag 冲突');

      // 新 etag → 成功。
      const list = await runtime.listSources();
      const currentEtag = list[0]!.etag;
      const patched = await runtime.applyPatch('design-system', {
        patch: [
          {
            op: 'replace',
            path: '/x-community-go/source/tokens/theme/radii/control',
            value: '2rem',
          },
        ],
        expectedEtag: currentEtag,
      });
      expect(typeof patched.etag).toBe('string');
      const after = JSON.parse(await readFile(schemaFile, 'utf8')) as {
        'x-community-go': {
          source: { tokens: { theme: { radii: Record<string, string> } } };
        };
      };
      expect(after['x-community-go'].source.tokens.theme.radii.control).toBe('2rem');
    } finally {
      await runtime.close();
    }
  });

  it('Patch 修改后校验失败不写文件', async () => {
    const runtime = await createSchemaRuntime({
      workspaceRoot: workspace,
      registryFile: 'tooling/foundation-contracts.json',
    });
    try {
      const schemaFile = join(workspace, 'packages/design-system/design-system.schema.json');
      const before = await readFile(schemaFile, 'utf8');
      const list = await runtime.listSources();
      // 写入会破坏 $defs.authoritySource（colors.light 类型非法）——但 patch 白名单只放行 source：
      // 这里直接 replace source 下某值为对象来触发校验失败。
      await expect(
        runtime.applyPatch('design-system', {
          patch: [
            {
              op: 'replace',
              path: '/x-community-go/source/tokens/theme/radii/control',
              value: { nested: true },
            },
          ],
          expectedEtag: list[0]!.etag,
        }),
      ).rejects.toThrow('校验失败');
      const after = await readFile(schemaFile, 'utf8');
      expect(after).toBe(before);
    } finally {
      await runtime.close();
    }
  });

  it('watch 触发（写文件后收到事件）', async () => {
    const runtime = await createSchemaRuntime({
      workspaceRoot: workspace,
      registryFile: 'tooling/foundation-contracts.json',
    });
    try {
      let fired = 0;
      const unwatch = await runtime.watch('design-system', () => {
        fired += 1;
      });
      const schemaFile = join(workspace, 'packages/design-system/design-system.schema.json');
      const doc = JSON.parse(await readFile(schemaFile, 'utf8')) as Record<string, unknown>;
      await writeFile(schemaFile, JSON.stringify(doc, null, 2), 'utf8');
      // watch 防抖 120ms；等待事件（最多 3s）。
      const deadline = Date.now() + 3000;
      while (fired === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(fired).toBeGreaterThan(0);
      unwatch();
    } finally {
      await runtime.close();
    }
  });
});

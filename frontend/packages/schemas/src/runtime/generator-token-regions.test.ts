import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readJsonFile } from './io';
import {
  applyTokenRegionContents,
  checkTokenRegionFreshness,
  parseRegionMarkers,
  renderRegionContent,
  TOKEN_REGION_MARKER_PREFIX,
  type RegionDeclaration,
} from './generator-token-regions';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const schemaPath = join(frontendRoot, 'packages', 'design-system', 'design-system.schema.json');
const tokensCssPath = join(frontendRoot, 'packages', 'design-system', 'src', 'tokens.css');

async function loadTokensFixture() {
  const schema = (await readJsonFile(schemaPath)) as Record<string, unknown>;
  const meta = schema['x-community-go'] as Record<string, unknown>;
  const artifact = (meta.artifacts as Array<Record<string, unknown>>).find(
    (a) => a.generator === 'css-token-regions-v1',
  )!;
  return {
    source: meta.source as Record<string, unknown>,
    options: artifact.options as { regions: RegionDeclaration[] },
    css: await readFile(tokensCssPath, 'utf8'),
  };
}

describe('css-token-regions-v1（真实 fixture）', () => {
  it('渲染的受控区段内容与 tokens.css 当前内容逐字节一致', async () => {
    const { source, options, css } = await loadTokensFixture();
    for (const region of options.regions) {
      const expected = renderRegionContent(source, region);
      const drift = checkTokenRegionFreshness(css, region.regionId, expected);
      expect(drift, `region ${region.regionId} 不应漂移`).toBeNull();
    }
  });

  it('mapping 模板决定输出名称：改模板前缀 → 输出变化（生成器零 DS 硬编码）', async () => {
    const { source, options } = await loadTokensFixture();
    const region = options.regions.find((r) => r.regionId === 'theme-properties')!;
    const original = renderRegionContent(source, region);
    // 把第一个 binding 模板的 --font-sans 换成 --font-renamed。
    const custom = {
      ...region,
      bindings: region.bindings.map((b, i) =>
        i === 0 ? { ...b, template: '  --font-renamed: {value};' } : b,
      ),
    };
    const changed = renderRegionContent(source, custom);
    expect(changed).not.toBe(original);
    expect(changed).toContain('--font-renamed');
    expect(changed).not.toContain('--font-sans');
  });

  it('marker 解析：缺失 / 重复 / 嵌套 / 不匹配均失败', () => {
    expect(() => parseRegionMarkers('/* @ds-region:a:start */\ncontent\n', ['a'])).toThrow(
      '缺少 end',
    );
    expect(() =>
      parseRegionMarkers(
        '/* @ds-region:a:start */\n/* @ds-region:a:start */\n/* @ds-region:a:end */\n',
        ['a'],
      ),
    ).toThrow('重复');
    expect(() =>
      parseRegionMarkers(
        '/* @ds-region:a:start */\n/* @ds-region:b:start */\n/* @ds-region:a:end */\n/* @ds-region:b:end */\n',
        ['a', 'b'],
      ),
    ).toThrow('嵌套');
    expect(() =>
      parseRegionMarkers('/* @ds-region:a:start */\n/* @ds-region:b:end */\n', ['a', 'b']),
    ).toThrow('不匹配');
    expect(() => parseRegionMarkers('', ['missing'])).toThrow('缺失');
  });

  it('区段替换只触碰定界内内容，marker 外保留（含手写段）', () => {
    const css = [
      '@theme {',
      '  /* @ds-region:theme-properties:start */',
      '  --font-sans: A;',
      '  /* @ds-region:theme-properties:end */',
      '  /* 手写行保持 */',
      '}',
    ].join('\n');
    const next = applyTokenRegionContents(
      css,
      'theme-properties',
      '  --font-sans: B;\n  --radius-x: 1px;',
    );
    expect(next).toContain('  --font-sans: B;');
    expect(next).toContain('/* 手写行保持 */');
    expect(next).toContain('/* @ds-region:theme-properties:start */');
    // marker 外字节（@theme 结构）原样。
    expect(next.startsWith('@theme {')).toBe(true);
    expect(next.endsWith('}')).toBe(true);
  });

  it('受控区段内容被手改 → freshness 失败', async () => {
    const { source, options } = await loadTokensFixture();
    const region = options.regions.find((r) => r.regionId === 'root-motion-properties')!;
    const expected = renderRegionContent(source, region);
    const drift = checkTokenRegionFreshness(
      [
        ':root {',
        `/* @ds-region:${region.regionId}:start */`,
        expected.replace(
          '--motion-duration-fast: calc(120ms * var(--motion-debug-scale));',
          '--motion-duration-fast: calc(999ms * var(--motion-debug-scale));',
        ),
        `/* @ds-region:${region.regionId}:end */`,
        '}',
      ].join('\n'),
      region.regionId,
      expected,
    );
    expect(drift).not.toBeNull();
    // 未改 → 通过。
    const clean = checkTokenRegionFreshness(
      [
        ':root {',
        `/* @ds-region:${region.regionId}:start */`,
        expected,
        `/* @ds-region:${region.regionId}:end */`,
        '}',
      ].join('\n'),
      region.regionId,
      expected,
    );
    expect(clean).toBeNull();
  });

  it('marker 注释格式与 TOKEN_REGION_MARKER_PREFIX 一致', () => {
    expect(TOKEN_REGION_MARKER_PREFIX).toBe('@ds-region:');
  });
});

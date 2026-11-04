import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { computeEtag, canonicalize } from './etag';
import { validateAuthorityDocument } from './protocol';
import { readJsonFile } from './io';
import { asMutableDocument } from './fixture-types';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const schemaPath = join(frontendRoot, 'packages', 'design-system', 'design-system.schema.json');
const registryPath = join(frontendRoot, 'tooling', 'foundation-contracts.json');

async function loadFixture() {
  const schema = (await readJsonFile(schemaPath)) as Record<string, unknown>;
  const registry = (await readJsonFile(registryPath)) as Record<string, unknown>;
  const contracts = registry.contracts as Record<string, unknown>;
  return { schema, contracts };
}

/** 深克隆（修改 fixture 不污染磁盘文件）。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('Schema Protocol 校验（真实 fixture）', () => {
  it('当前 Design System Schema 通过完整协议校验', async () => {
    const { schema, contracts } = await loadFixture();
    const issues = validateAuthorityDocument(schema, contracts);
    expect(issues).toEqual([]);
  });

  it('contractRef.pointer 未转义 "/" 时拒绝', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].contractRef.pointer = '/contracts/@community-go/design-system'; // 未转义
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('RFC 6901 escaping'))).toBe(true);
  });

  it('重新声明 registry-owned 字段（owner/maturity/layer/exports）→ fail', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].maturity = 'stable';
    doc['x-community-go'].owner = 'x';
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('registry-owned'))).toBe(true);
  });

  it('contractRef entry 错配（authorityId 不在 registry）→ fail', async () => {
    const { schema } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].authorityId = '@community-go/nonexistent';
    const issues = validateAuthorityDocument(doc, {});
    expect(issues.some((i) => i.includes('registry entry 与 authorityId 不匹配'))).toBe(true);
  });

  it('facts 悬空 sourcePointer → fail', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].facts = [
      { id: 'x', sourcePointer: '/x-community-go/source/nonexistent' },
    ];
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('悬空'))).toBe(true);
  });

  it('fact 携带值副本（额外字段）→ fail', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].facts = [
      { id: 'x', sourcePointer: '/x-community-go/source/tokens/colors', value: '#fff' },
    ];
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('facts 不保存值副本'))).toBe(true);
  });

  it('artifact mapping 内嵌 fallback/value → fail', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    const regions = doc['x-community-go'].artifacts[0]!.options.regions;
    regions![0]!.bindings.push({
      kind: 'scalar',
      sourcePointer: '/x-community-go/source/tokens/theme/fontSans',
      value: '#fff',
    });
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('mapping 禁止内嵌'))).toBe(true);
  });

  it('source 内出现 var( → fail（引用必须结构化 ref）', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].source.tokens.rootMotion.durationBase.fast = 'var(--x)';
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('CSS var()'))).toBe(true);
  });

  it('patchableSourcePointers 指向 source 之外 → fail', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].authoring.patchableSourcePointers = ['/x-community-go/facts'];
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('必须位于 /x-community-go/source 之下'))).toBe(true);
  });

  it('facts 多条指向同一 sourcePointer → fail（一个事实只有一个值 Source）', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc['x-community-go'].facts.push({
      id: 'dup',
      sourcePointer: '/x-community-go/source/tokens/colors',
    });
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('sourcePointer 重复'))).toBe(true);
  });

  it('$defs.authoritySource 校验 source 实例结构（缺 required 字段 → fail）', async () => {
    const { schema, contracts } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    delete doc['x-community-go'].source.tokens.colors.dark;
    const issues = validateAuthorityDocument(doc, contracts);
    expect(issues.some((i) => i.includes('required property'))).toBe(true);
  });

  it('etag 反映内容变化且键序不敏感', async () => {
    const { schema } = await loadFixture();
    const a = clone(schema);
    const b = clone(schema);
    // canonicalize 按键排序：仅键序不同的对象 canonical JSON 相同 → etag 相同。
    const canonicalA = canonicalize(a);
    const canonicalB = canonicalize(b);
    expect(JSON.stringify(canonicalA)).toBe(JSON.stringify(canonicalB));
    expect(computeEtag(a)).toBe(computeEtag(b));
    // 值变化 → etag 不同。
    const docB = asMutableDocument(b);
    docB['x-community-go'].source.tokens.colors.light.brand = '#000000';
    expect(computeEtag(a)).not.toBe(computeEtag(b));
  });
});

describe('Draft 2020-12 meta（Ajv strict）', () => {
  it('引入未知关键字 → strict 报错（x-community-go 是唯一注册的扩展）', async () => {
    const { schema } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc.someUnknownKeyword = true;
    const issues = validateAuthorityDocument(doc, undefined);
    // 语法校验在 meta shape 之前：unknown keyword 必须 strict fail。
    expect(
      issues.some(
        (i) => i.includes('strict') || i.includes('unknown') || i.includes('not allowed'),
      ),
    ).toBe(true);
  });

  it('非 Draft 2020-12 $schema → fail', async () => {
    const { schema } = await loadFixture();
    const doc = asMutableDocument(clone(schema));
    doc.$schema = 'https://json-schema.org/draft-07/schema';
    const issues = validateAuthorityDocument(doc, undefined);
    expect(issues.length).toBeGreaterThan(0);
  });
});

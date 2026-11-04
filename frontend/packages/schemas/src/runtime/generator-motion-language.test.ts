import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readJsonFile } from './io';
import {
  MOTION_GENERATED_HEADER,
  renderMotionCssFile,
  validateMotionLanguageReferences,
  type MotionLanguageOptions,
} from './generator-motion-language';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const schemaPath = join(frontendRoot, 'packages', 'design-system', 'design-system.schema.json');
const motionCssPath = join(frontendRoot, 'packages', 'design-system', 'src', 'motion.css');

async function loadMotionFixture() {
  const schema = (await readJsonFile(schemaPath)) as Record<string, unknown>;
  const meta = schema['x-community-go'] as Record<string, unknown>;
  const artifact = (meta.artifacts as Array<Record<string, unknown>>).find(
    (a) => a.generator === 'css-motion-language-v1',
  )!;
  return {
    source: meta.source as Record<string, unknown>,
    options: artifact.options as MotionLanguageOptions,
    css: await readFile(motionCssPath, 'utf8'),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 测试用可变 fixture 类型（只覆盖测试修改的字段）。 */
type MutableLanguage = {
  doc: string[];
  recipes: Array<{
    id: string;
    semantics: string;
    consumer: string;
    reducedMotion: string;
  }>;
  keyframes: Array<{
    id: string;
    doc?: string[];
    frames: Array<{
      stage: 'from' | 'to' | '0%' | '100%';
      ops: Array<{
        op: string;
        value?: number;
        axis?: string;
        distanceRef?: string;
        factor?: number;
      }>;
    }>;
  }>;
};

type MutableSource = {
  motionLanguage: MutableLanguage;
  tokens: Record<string, unknown>;
};

/** 深拷贝 source 为可修改视图（motionLanguage.keyframes 等可被测试破坏）。 */
function mutableSource(source: Record<string, unknown>): MutableSource {
  return clone(source) as unknown as MutableSource;
}

describe('css-motion-language-v1（真实 fixture）', () => {
  it('整文件渲染与 motion.css 当前内容逐字节一致', async () => {
    const { source, options, css } = await loadMotionFixture();
    const expected = renderMotionCssFile(source, options);
    expect(expected).toBe(css);
  });

  it('generated header 存在', async () => {
    const { source, options } = await loadMotionFixture();
    const expected = renderMotionCssFile(source, options);
    expect(expected.startsWith(MOTION_GENERATED_HEADER)).toBe(true);
  });

  it('recipe/keyframe 重复 id → 渲染失败', async () => {
    const { source, options } = await loadMotionFixture();
    const doc = mutableSource(source);
    doc.motionLanguage.recipes.push({ ...doc.motionLanguage.recipes[0]! });
    expect(() => renderMotionCssFile(doc, options)).toThrow('重复 id');
  });

  it('非法 operation op → 渲染失败', async () => {
    const { source, options } = await loadMotionFixture();
    const doc = mutableSource(source);
    doc.motionLanguage.keyframes[0]!.frames[0]!.ops = [{ op: 'rotate', value: 90 }];
    expect(() => renderMotionCssFile(doc, options)).toThrow('非法 operation');
  });

  it('translate 悬空 distanceRef → 引用校验失败', async () => {
    const { source, options } = await loadMotionFixture();
    const doc = mutableSource(source);
    const translateKeyframe = doc.motionLanguage.keyframes.find((k) => k.id === 'content-rise-in')!;
    translateKeyframe.frames[0]!.ops[0]!.distanceRef =
      '/x-community-go/source/tokens/rootMotion/distances/values/missing';
    const issues = validateMotionLanguageReferences(doc, options);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('translate ref 未命中 tokenVarPrefix 映射 → 引用校验失败（Generator 不隐式命名）', async () => {
    const { source, options } = await loadMotionFixture();
    const doc = mutableSource(source);
    const translateKeyframe = doc.motionLanguage.keyframes.find((k) => k.id === 'content-rise-in')!;
    translateKeyframe.frames[0]!.ops[0]!.distanceRef =
      '/x-community-go/source/tokens/theme/radii/control';
    const issues = validateMotionLanguageReferences(doc, options);
    expect(issues.some((i) => i.includes('tokenVarPrefix'))).toBe(true);
  });

  it('整文件 drift 检测：改动一行 → 输出不同（逐字节 freshness）', async () => {
    const { source, options, css } = await loadMotionFixture();
    const tampered = css.replace('opacity: 0;', 'opacity: 0.5;');
    const expected = renderMotionCssFile(source, options);
    expect(tampered).not.toBe(expected);
  });

  it('opacity/width/translate 渲染与既有 declaration 一致', async () => {
    const { source, options } = await loadMotionFixture();
    const expected = renderMotionCssFile(source, options);
    expect(expected).toContain('opacity: 0;');
    expect(expected).toContain('width: 85%;');
    expect(expected).toContain('transform: translateY(var(--motion-distance-reveal));');
    expect(expected).toContain(
      'transform: translateY(calc(var(--motion-distance-reveal) * -0.5));',
    );
  });
});

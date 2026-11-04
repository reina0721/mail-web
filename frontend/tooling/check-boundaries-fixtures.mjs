import { strict as assert } from 'node:assert';

import { findImportPolicyViolations, findSourcePolicyViolations } from './boundary-policy.mjs';

const safeSource = findSourcePolicyViolations({
  content: `<Action className="bg-surface text-ink" onPress={save}>保存</Action>`,
  extension: '.tsx',
  localPath: 'apps/web/src/app/preferences/safe.tsx',
});
assert.deepEqual(safeSource, [], '项目语义 class 与项目 Action 应通过边界规则');

assert(
  findImportPolicyViolations({
    localPath: 'apps/web/src/app/example.tsx',
    specifier: `@community-go/${'ad' + 'min-'}framework`,
    workspace: 'apps/web',
  }).some(([rule]) => rule === 'Architecture naming'),
  '旧 package namespace 必须失败',
);

const safeAdapter = findSourcePolicyViolations({
  content: `<Modal.Dialog className="modal--custom" data-slot="dialog" />`,
  extension: '.tsx',
  localPath: 'packages/ui-adapter/src/dialog.tsx',
});
assert.deepEqual(safeAdapter, [], 'vendor documented slot/class 只允许在 UI Adapter 内使用');

const safeAdapterArbitrary = findSourcePolicyViolations({
  content: `<span className="[&>svg]:m-0" /><div className="sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]" />`,
  extension: '.tsx',
  localPath: 'packages/ui-adapter/src/action.tsx',
});
assert.deepEqual(
  safeAdapterArbitrary,
  [],
  'UI Adapter 内部控制 vendor 的 arbitrary 写法豁免（由 Adapter 收口）',
);

const negativeFixtures = [
  {
    name: 'arbitrary value',
    input: {
      content: `<div className="h-[37px]" />`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Token governance',
  },
  {
    name: 'native form control',
    input: {
      content: `<select><option>one</option></select>`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'UI contract',
  },
  {
    name: 'adapter internal class',
    input: {
      content: `<div className="ui-overlay-surface" />`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'UI contract',
  },
  {
    name: 'vendor class map',
    input: {
      content: `<Vendor classNames={{ root: 'bg-surface' }} />`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Vendor contract',
  },
  {
    name: 'vendor DOM selector',
    input: {
      content: `.page [data-slot="dialog"] { border: 0; }`,
      extension: '.css',
      localPath: 'apps/web/src/feature.css',
    },
    rule: 'Vendor contract',
  },
  {
    name: 'important',
    input: {
      content: `.page { border: 0 !important; }`,
      extension: '.css',
      localPath: 'apps/web/src/feature.css',
    },
    rule: 'Style governance',
  },
  {
    name: 'hard-coded color',
    input: {
      content: `<div style={{ color: '#fff' }} />`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Token governance',
  },
  {
    name: 'empty suspense fallback',
    input: {
      content: `<Suspense fallback={null}><Page /></Suspense>`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Content continuity',
  },
  {
    name: 'feature keyframes',
    input: {
      content: `@keyframes local-enter { from { opacity: 0; } }`,
      extension: '.css',
      localPath: 'apps/web/src/app/example.css',
    },
    rule: 'Motion governance',
  },
  {
    name: 'numeric motion utility',
    input: {
      content: `<div className="duration-300" />`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Motion governance',
  },
  {
    name: 'feature observer',
    input: {
      content: `const observer = new IntersectionObserver(() => undefined);`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Host isolation',
  },
  {
    name: 'feature media query',
    input: {
      content: `window.matchMedia('(prefers-reduced-motion: reduce)');`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Host isolation',
  },
  {
    name: 'feature motion attribute',
    input: {
      content: `<div data-motion-recipe="screen" />`,
      extension: '.tsx',
      localPath: 'apps/web/src/page-components/example.tsx',
    },
    rule: 'Motion governance',
  },
  {
    name: 'variant arbitrary value',
    input: {
      content: `<div className="sm:w-[13px] hover:text-[#333]" />`,
      extension: '.tsx',
      localPath: 'apps/web/src/app/example.tsx',
    },
    rule: 'Token governance',
  },
];

for (const fixture of negativeFixtures) {
  const result = findSourcePolicyViolations(fixture.input);
  assert(
    result.some(([rule]) => rule === fixture.rule),
    `${fixture.name} fixture 应触发 ${fixture.rule}`,
  );
}

assert(
  findImportPolicyViolations({
    localPath: 'apps/web/src/app/example.tsx',
    specifier: '@heroui/react',
    workspace: 'apps/web',
  }).some(([rule]) => rule === 'HeroUI isolation'),
  'UI Adapter 外导入 HeroUI 必须失败',
);

/* ---- State foundation boundary ---- */
assert(
  findImportPolicyViolations({
    localPath: 'apps/web/src/state/use-shell-store.ts',
    specifier: 'zustand',
    workspace: 'apps/web',
  }).some(([rule]) => rule === 'State foundation'),
  'apps/web 裸 import zustand 必须失败（应经 @community-go/state-foundation）',
);
assert(
  findImportPolicyViolations({
    localPath: 'surfaces/plugins/example/stores/list.ts',
    specifier: 'zustand/middleware',
    workspace: 'surfaces',
  }).some(([rule]) => rule === 'State foundation'),
  'Plugin 裸 import zustand 必须失败',
);
assert.deepEqual(
  findImportPolicyViolations({
    localPath: 'packages/state-foundation/src/framework.ts',
    specifier: 'zustand',
    workspace: 'packages/state-foundation',
  }),
  [],
  'packages/state-foundation 内部 import zustand 应通过（唯一允许层）',
);
assert.deepEqual(
  findImportPolicyViolations({
    localPath: 'packages/state-foundation/src/framework.ts',
    specifier: 'zustand/middleware',
    workspace: 'packages/state-foundation',
  }),
  [],
  'state-foundation import zustand/middleware 应通过',
);
assert(
  findImportPolicyViolations({
    localPath: 'apps/web/src/app/example.tsx',
    specifier: '@community-go/state-foundation/testing',
    workspace: 'apps/web',
  }).some(([rule]) => rule === 'State foundation'),
  'production 代码 import testing subpath 必须失败',
);

assert.deepEqual(
  findImportPolicyViolations({
    localPath: 'packages/ui-adapter/src/action.tsx',
    specifier: '@heroui/react',
    workspace: 'packages/ui-adapter',
  }),
  [],
  'UI Adapter 内导入 HeroUI 应通过',
);

assert(
  findImportPolicyViolations({
    localPath: 'apps/web/src/app/example.tsx',
    specifier: '@community-go/config/node',
    workspace: 'apps/web',
  }).some(([rule]) => rule === 'Config foundation'),
  'Feature 代码 import @community-go/config/node 必须失败',
);
assert.deepEqual(
  findImportPolicyViolations({
    localPath: 'apps/web/next.config.ts',
    specifier: '@community-go/config/node',
    workspace: 'apps/web',
  }),
  [],
  'apps/web/next.config.ts import @community-go/config/node 应通过',
);

console.log(`Boundary fixtures passed: ${negativeFixtures.length + 6} cases.`);

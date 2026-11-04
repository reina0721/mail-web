import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

import { findImportPolicyViolations, findSourcePolicyViolations } from './boundary-policy.mjs';

const frontendRoot = resolve(import.meta.dirname, '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.css']);
const ignoredDirectories = new Set([
  'node_modules',
  'dist',
  'out',
  'coverage',
  '.next',
  '.vite',
  'test-results',
  'playwright-report',
]);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(entryPath)));
    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function workspaceOf(filePath) {
  const localPath = relative(frontendRoot, filePath).split(sep);
  if (!['apps', 'packages', 'surfaces'].includes(localPath[0] ?? '')) return null;
  if (localPath[0] === 'surfaces') return 'surfaces';
  return localPath.slice(0, 2).join('/');
}

function report(violations, filePath, rule, detail) {
  violations.push(`${relative(frontendRoot, filePath)}: ${rule} - ${detail}`);
}

const files = await collectSourceFiles(frontendRoot);
const violations = [];
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;

for (const filePath of files) {
  const content = await readFile(filePath, 'utf8');
  const localPath = relative(frontendRoot, filePath).split(sep).join('/');
  const workspace = workspaceOf(filePath);

  for (const [rule, detail] of findSourcePolicyViolations({
    content,
    extension: extname(filePath),
    localPath,
  })) {
    report(violations, filePath, rule, detail);
  }

  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    for (const [rule, detail] of findImportPolicyViolations({ localPath, specifier, workspace })) {
      report(violations, filePath, rule, detail);
    }
    if (specifier.startsWith('.')) {
      const targetWorkspace = workspaceOf(resolve(filePath, '..', specifier));
      if (workspace && targetWorkspace && workspace !== targetWorkspace) {
        report(
          violations,
          filePath,
          'Workspace boundary',
          `禁止跨 Workspace 相对导入 ${specifier}`,
        );
      }
    }
  }

  if (
    workspace?.startsWith('packages/') &&
    !localPath.startsWith('packages/state-foundation/') &&
    /\b(?:window|document|navigator|localStorage|sessionStorage)\b/.test(content)
  ) {
    report(violations, filePath, 'Host leakage', '公共包不得直接访问浏览器 Host API');
  }

  // Plugin（surfaces/plugins/**）是被 Web Host 装配的真实 client/route 代码：
  // 在 Client boundary 正常使用 Web API（window.setTimeout、document/URL 下载等）合法，
  // 不属 Host leakage。Surface 公共基础设施（surfaces/src，被公共消费）
  // 才不得直接访问浏览器 Host API。
  if (
    workspace === 'surfaces' &&
    !localPath.includes('/plugins/') &&
    /\b(?:window|document|navigator|localStorage|sessionStorage)\b/.test(content)
  ) {
    report(violations, filePath, 'Host leakage', 'Surface 源码不得直接访问浏览器 Host API');
  }
}

if (violations.length > 0) {
  console.error(`Architecture checks failed:\n${violations.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture checks passed for ${files.length} source files.`);
}

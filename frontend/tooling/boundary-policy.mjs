const testPathPattern = /(?:^|\/)\b(?:e2e|test|tests|__tests__)\b(?:\/|$)|\.(?:test|spec)\.[^.]+$/;

export function findSourcePolicyViolations({ content, extension, localPath }) {
  const violations = [];
  const isUiAdapter = localPath.startsWith('packages/ui-adapter/');
  const isTest = testPathPattern.test(localPath);
  const isMotionKeyframeAuthority = [
    'packages/design-system/src/motion.css',
    'packages/surface-foundation/src/styles.css',
  ].includes(localPath);
  const isHostMotionBoundary =
    localPath.startsWith('apps/web/src/host/') ||
    // ViewportReveal（Surface reveal recipe 实现）随 ownership 提升到 surface-foundation，
    // 是 IntersectionObserver 的唯一合法实现位置之一（Observer 生命周期语义不变）。
    localPath === 'packages/surface-foundation/src/viewport-reveal.tsx';
  const isFeatureSource =
    localPath.startsWith('apps/web/src/app/') ||
    localPath.startsWith('apps/web/src/page-components/') ||
    // Plugin 页面实现层（routes/ + src/）与 Host Feature 同等受 Motion/UI 治理；
    // 声明文件（plugin.ts / plugin.navigation.ts / i18n.ts）为 .ts，不命中 .tsx 规则。
    localPath.includes('/plugins/');

  if (extension === '.tsx' && !isUiAdapter) {
    // 只在 className 字符串内容里检测 arbitrary value（避免误伤泛型/数组/类型标注）。
    // 排除 Adapter/受控 state 选择器（data-*/aria-*/group-data-* 与 vendor [&...]）。
    const classNameRe = /className=(?:"([^"]*)"|`([^`]*)`)/g;
    let classNameMatch;
    while ((classNameMatch = classNameRe.exec(content)) !== null) {
      const raw = classNameMatch[1] ?? classNameMatch[2] ?? '';
      for (const token of raw.split(/\s+/)) {
        if (
          token &&
          /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)*\[[^\]]+\]$/.test(token) &&
          !/^(?:data|aria|group-data|peer-data|\[&)/.test(token)
        ) {
          violations.push(['Token governance', `禁止 Tailwind arbitrary value: ${token}`]);
        }
      }
    }
  }

  if (extension === '.tsx' && !isUiAdapter && /<(?:input|textarea|select|option)\b/.test(content)) {
    violations.push(['UI contract', 'Feature 禁止绕过 UI Adapter 使用原生表单控件']);
  }

  if (
    extension === '.tsx' &&
    !isUiAdapter &&
    /\bui-(?:field|overlay|anchored|listbox|option)(?:-|\b)/.test(content)
  ) {
    violations.push(['UI contract', 'Adapter 内部 Element 样式禁止向 Feature 泄漏']);
  }

  if (
    extension === '.tsx' &&
    !isUiAdapter &&
    !isTest &&
    /\bclassNames\s*=|\b(?:button|modal|popover|drawer|dropdown|tabs|table)--[a-z-]+/.test(content)
  ) {
    violations.push(['Vendor contract', 'Feature 禁止消费 vendor slot/class map 或 BEM class']);
  }

  if (
    extension === '.css' &&
    !isUiAdapter &&
    /\[data-slot(?:\]|=)|\.(?:button|modal|popover|drawer|dropdown|tabs|table)--[a-z-]+/.test(
      content,
    )
  ) {
    violations.push(['Vendor contract', '公开样式禁止穿透 vendor slot 或内部 BEM DOM']);
  }

  if (content.includes('!important')) {
    violations.push(['Style governance', '禁止 !important']);
  }

  if (extension === '.tsx' && /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(content)) {
    violations.push(['Token governance', '组件中禁止硬编码颜色']);
  }

  if (
    extension === '.css' &&
    localPath !== 'packages/design-system/src/tokens.css' &&
    /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(content)
  ) {
    violations.push(['Token governance', '硬编码颜色只能由 Design Token 权威文件声明']);
  }

  if (extension === '.tsx' && /fallback\s*=\s*\{\s*null\s*\}/m.test(content)) {
    violations.push(['Content continuity', 'Suspense 必须提供结构化 Loading，不得使用空 fallback']);
  }

  if (extension === '.css' && !isMotionKeyframeAuthority && /@keyframes\b/.test(content)) {
    violations.push(['Motion governance', 'Keyframes 只能由 Motion 权威样式登记']);
  }

  if (extension === '.tsx' && /\b(?:duration|delay)-\d+\b/.test(content)) {
    violations.push(['Motion governance', '组件不得硬编码 Tailwind duration 或 delay 数值']);
  }

  if (!isTest && !isHostMotionBoundary && /\bIntersectionObserver\b/.test(content)) {
    violations.push(['Host isolation', 'IntersectionObserver 生命周期只能由 Host 管理']);
  }

  if (!isTest && !isHostMotionBoundary && /\bmatchMedia\s*\(/.test(content)) {
    violations.push(['Host isolation', 'matchMedia 偏好读取只能由 Host Motion Policy 管理']);
  }

  if (extension === '.tsx' && isFeatureSource && /\bdata-motion-[a-z-]+\s*=/.test(content)) {
    violations.push(['Motion governance', 'Feature 不得写入 Motion Policy 或 Recipe 属性']);
  }

  // 页面不得以内联 style 硬编码动画时长/位移（必须走 Motion Token / Recipe）；
  // Tailwind duration-\d / delay-\d class 由上一规则覆盖。
  if (
    extension === '.tsx' &&
    isFeatureSource &&
    /(?:animation|transition)(?:Duration|Delay|TimingFunction)['"]?\s*:\s*['"]?\d/.test(content)
  ) {
    violations.push([
      'Motion governance',
      'Feature 不得内联硬编码 animation/transition 时长或缓动',
    ]);
  }

  return violations;
}

export function findImportPolicyViolations({ localPath, specifier, workspace }) {
  const violations = [];
  const legacyArchitecturePackagePrefix = `@community-go/${'ad' + 'min-'}`;

  if (specifier.startsWith(legacyArchitecturePackagePrefix)) {
    violations.push(['Architecture naming', '禁止恢复旧 package namespace']);
  }

  if (specifier.startsWith('@heroui/') && !localPath.startsWith('packages/ui-adapter/')) {
    violations.push(['HeroUI isolation', '直接依赖只能出现在 packages/ui-adapter']);
  }
  const importsZustand =
    specifier === 'zustand' ||
    specifier === 'zustand/middleware' ||
    specifier === 'zustand/vanilla' ||
    specifier.startsWith('zustand/');
  if (importsZustand && !localPath.startsWith('packages/state-foundation/')) {
    violations.push([
      'State foundation',
      'zustand 只能由 packages/state-foundation 直接 import；业务经 @community-go/state-foundation 消费',
    ]);
  }
  // testing subpath 只允许测试/测试工具消费（production 禁止 import）。
  const isTestingSource = localPath.includes('/testing/') || testPathPattern.test(localPath);
  if (
    specifier.startsWith('@community-go/state-foundation/testing') &&
    !isTestingSource &&
    !localPath.startsWith('packages/state-foundation/')
  ) {
    violations.push(['State foundation', 'testing subpath 禁止被 production 代码 import']);
  }
  if (
    specifier === '@community-go/config/node' ||
    specifier.startsWith('@community-go/config/node')
  ) {
    const isNodeAllowed =
      isTestingSource ||
      localPath.startsWith('tooling/') ||
      localPath === 'playwright.config.ts' ||
      localPath === 'apps/web/next.config.ts' ||
      localPath.startsWith('packages/config/');
    if (!isNodeAllowed) {
      violations.push([
        'Config foundation',
        '@community-go/config/node 只能在 Node 构建与工具链中消费，禁止在应用运行时/浏览器代码中导入',
      ]);
    }
  }
  if (specifier === '@community-go/ui-adapter') {
    violations.push(['UI adapter imports', '必须使用 UI Adapter 语义子路径，禁止根 Barrel 导入']);
  }
  const importsWebHost =
    specifier === '@community-go/web' || specifier.startsWith('@community-go/web/');
  const importsSurface =
    specifier === '@community-go/surface' || specifier.startsWith('@community-go/surface/');

  if (workspace?.startsWith('packages/') && importsWebHost) {
    violations.push(['Dependency direction', '公共包不得依赖 Runtime Host']);
  }
  if ((workspace === 'surfaces' || workspace?.startsWith('surfaces/')) && importsWebHost) {
    violations.push(['Dependency direction', 'Surface 实现不得依赖 Runtime Host']);
  }
  if (
    (workspace?.startsWith('apps/') || workspace?.startsWith('packages/')) &&
    (specifier === '@community-go/surface/plugins' ||
      specifier.startsWith('@community-go/surface/plugins/'))
  ) {
    violations.push(['Surface private boundary', 'Host/公共包不得导入 Surface Plugin 内部实现']);
  }
  if (workspace?.startsWith('packages/') && importsSurface) {
    violations.push(['Dependency direction', '公共包不得依赖 Product Surface 实现']);
  }
  if (workspace === 'packages/core') {
    const allowed =
      specifier === '@community-go/types' || specifier === 'vitest' || specifier.startsWith('.');
    if (!allowed) violations.push(['Core purity', `Core 不得依赖 ${specifier}`]);
  }

  return violations;
}

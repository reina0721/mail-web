/**
 * Plugin Framework —— 诊断集合。
 *
 * Diagnostics 只承载失败语义，不承载业务模型；Registry 与 Host Capability 分析
 * 统一通过 collectDiagnostics 汇聚错误，错误必须完整向上导出，不允许静默降级。
 */

export type DiagnosticCode =
  | 'UNKNOWN_ROUTE'
  | 'MISSING_PARAMS'
  | 'EXTRA_PARAMS'
  | 'HOST_MODE_CANNOT_DEPLOY'
  | 'DUPLICATE_ROUTE_ID'
  | 'DUPLICATE_PATTERN'
  | 'CROSS_PLUGIN_REFERENCE'
  | 'INVALID_OVERRIDE_RATIONALE'
  | 'ORPHAN_ROUTE'
  | 'UNKNOWN_NAVIGATION_GROUP'
  | 'NAVIGATION_NAMESPACE_VIOLATION'
  | 'UNKNOWN_NAVIGATION_ROUTE_TARGET'
  | 'NAVIGATION_DYNAMIC_TARGET_UNSUPPORTED'
  | 'NAVIGATION_NODE_ORPHAN';

export type Diagnostic = Readonly<{
  code: DiagnosticCode;
  routeId?: string;
  message: string;
}>;

export type Diagnostics = Readonly<{
  errors: readonly Diagnostic[];
  /** 是否有任何错误。 */
  hasErrors: boolean;
}>;

/** 累积一个诊断。 */
export function collectDiagnostics(target: Diagnostic[], diagnostic: Diagnostic): void {
  target.push(diagnostic);
}

/** 将诊断列表收敛为只读结果。 */
export function finalizeDiagnostics(errors: readonly Diagnostic[]): Diagnostics {
  return { errors, hasErrors: errors.length > 0 };
}

/** 格式化诊断为单行文本，便于测试与 CLI 展示。 */
export function formatDiagnostics(diagnostics: Diagnostics): string {
  return diagnostics.errors
    .map((item) => `[${item.code}]${item.routeId ? ` ${item.routeId}:` : ''} ${item.message}`)
    .join('\n');
}

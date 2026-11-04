/**
 * Active Path Anchored Accordion —— Shell Navigation UX/State Policy（纯函数）。
 *
 * 统一管理 Expanded Navigation Tree 的展开状态，不让每个 Menu Item 各自维护 isOpen。
 *
 * 模型：
 * - Accordion scope：顶层所有 Branch 共享 `root` scope（visual group ≠ accordion parent，
 *   group 只是视觉分类标题，不参与 Accordion topology）；真实嵌套 Branch 的下一层 scope
 *   使用该 Branch 的 navigationId。每个 scope 同时至多展开「1 个 active branch +
 *   1 个 exploration branch」。
 * - active 锚定：当前 Route 的完整 active ancestor chain 由运行时推导、始终展开，
 *   不进入 exploration；active ancestor 不允许被普通 toggle 收起到隐藏当前 Route。
 * - exploration：瞬时用户意图，绑定产生它的 routeKey（currentPath）。真实 Route Commit
 *   后旧 exploration 立即失效并清空；same-route no-op 保留。
 * - subtree cleanup：收起或替换某 exploration branch 时，同步删除该 branch 子树内所有
 *   exploration scope，避免历史展开状态在重新打开后复活。
 *
 * 本模块是纯规则，只消费注入的树模型（branchNavigationId -> descendant scope keys），
 * 不依赖 Next、Browser 或 React。
 */

export const accordionRootScope = 'root';

/** scopeKey -> 该 scope 当前 exploration 的 branch navigationId（同一 scope 唯一）。 */
export type AccordionExploration = ReadonlyMap<string, string>;

/** Accordion 状态：exploration + 产生它的 routeKey（世代边界）。 */
export type AccordionModel = Readonly<{
  /** 产生当前 exploration 时的 currentPath；Route Commit 后作为世代边界。 */
  routeKey: string;
  exploration: AccordionExploration;
}>;

/** 单次用户 toggle 的输入。 */
export type AccordionToggle = Readonly<{
  branchId: string;
  /** branch 所属 scope：顶层为 'root'，嵌套层为父 branch navigationId。 */
  scopeKey: string;
  /** true = 用户展开；false = 用户收起。 */
  expand: boolean;
  /** 当前 currentPath（reducer 的世代边界）。 */
  routeKey: string;
}>;

/** reducer 上下文：active 锚定集合与子树拓扑。 */
export type AccordionReduceContext = Readonly<{
  /** 当前 active leaf 的全部 ancestor branch navigationId。 */
  activeBranchIds: ReadonlySet<string>;
  /** branchNavigationId -> 该 branch 子树内全部 branch navigationId（含自身）。 */
  descendantBranchIds: ReadonlyMap<string, readonly string[]>;
}>;

/** 空 Accordion 模型：无 exploration，绑定 routeKey。 */
export function emptyAccordionModel(routeKey: string): AccordionModel {
  return { routeKey, exploration: new Map() };
}

/** 把模型重置到指定 Route 世代：清空 exploration。 */
export function resetAccordionModel(routeKey: string): AccordionModel {
  return emptyAccordionModel(routeKey);
}

/**
 * 跨路由携带模型（menuMemory=开）：把 routeKey 推进到当前 Route，**保留** exploration。
 * active ancestor 仍由新 Route 推导并始终展开；旧的 exploration 分支继续展开，
 * 但同 scope 至多一个 exploration 的约束、subtree cleanup 与 toggle 世代归一均保持
 * （用户在新 Route 上 toggle 时 reducer 基于本模型正常替换/收起）。
 */
export function carryAccordionModel(model: AccordionModel, routeKey: string): AccordionModel {
  if (model.routeKey === routeKey) return model;
  return { routeKey, exploration: new Map(model.exploration) };
}

/** 仅保留 routeKey 与当前 Route 一致的 exploration（渲染门控）。 */
export function effectiveExplorationOf(
  model: AccordionModel,
  currentPath: string,
): AccordionExploration {
  return model.routeKey === currentPath ? model.exploration : new Map();
}

/**
 * 某 branch 是否展开：
 * - active ancestor（锚定）→ 展开；
 * - 否则仅当它是当前 scope 的 exploration branch 才展开。
 * exploration 必须已经过 routeKey 门控（effectiveExplorationOf 的结果）。
 */
export function isBranchExpanded(opts: {
  branchId: string;
  scopeKey: string;
  isActiveAncestor: boolean;
  exploration: AccordionExploration;
}): boolean {
  if (opts.isActiveAncestor) return true;
  return opts.exploration.get(opts.scopeKey) === opts.branchId;
}

/**
 * 删除 branch 子树内全部 exploration scope（subtree cleanup）。
 * branchId 自身也是其子级的 scopeKey，因此从 descendantBranchIds（含自身）删除即可
 * 移除「branchId -> 内部探索」及更深层条目；不包含 branchId 的父级 scope 条目
 * （由调用方单独处理 scopeKey 指向自身的删除/覆盖）。
 */
function removeBranchSubtree(
  exploration: Map<string, string>,
  branchId: string,
  descendantBranchIds: ReadonlyMap<string, readonly string[]>,
): void {
  for (const scopeKey of descendantBranchIds.get(branchId) ?? [branchId]) {
    exploration.delete(scopeKey);
  }
}

/**
 * 单次 toggle 的 reducer。
 *
 * 世代归一：若 model.routeKey !== toggle.routeKey，说明保存的是上一 Route 的 exploration；
 * 先归一化为 { routeKey: toggle.routeKey, exploration: EMPTY }，再处理本次 toggle。
 * 避免 Route Commit 后、清理 effect 尚未执行的短窗口中，新 toggle 基于旧 exploration
 * 计算、随后又被 effect 清掉。
 *
 * 规则：
 * - 收起且 branch 是 active ancestor → no-op（不允许收起到隐藏当前 Route）。
 * - 收起且非 active → 仅当它是当前 scope 的 exploration 时，删除该 scope 条目
 *   与其子树内全部 exploration scope（subtree cleanup）。
 * - 展开且 branch 是 active ancestor → no-op（已由锚定展开）。
 * - 展开且非 active → 替换该 scope 的旧 exploration（先清旧 exploration 的子树 scope）。
 */
export function reduceNavigationAccordion(
  model: AccordionModel,
  toggle: AccordionToggle,
  context: AccordionReduceContext,
): AccordionModel {
  const isActiveAncestor = context.activeBranchIds.has(toggle.branchId);
  // 世代归一：旧 Route 的 exploration 不参与本次 toggle。
  const baseExploration =
    model.routeKey === toggle.routeKey ? new Map(model.exploration) : new Map<string, string>();
  const nextRouteKey = toggle.routeKey;

  if (toggle.expand) {
    if (isActiveAncestor) {
      // active ancestor 已由锚定展开，无需记录；base 若来自旧世代已归一为空。
      return { routeKey: nextRouteKey, exploration: baseExploration };
    }
    const previous = baseExploration.get(toggle.scopeKey);
    if (previous !== undefined && previous !== toggle.branchId) {
      // 替换同 scope 旧 exploration：先清其子树，避免历史展开复活。
      removeBranchSubtree(baseExploration, previous, context.descendantBranchIds);
    }
    baseExploration.set(toggle.scopeKey, toggle.branchId);
    return { routeKey: nextRouteKey, exploration: baseExploration };
  }

  // 收起
  if (isActiveAncestor) {
    // active ancestor 不允许被普通 toggle 收起（收起会隐藏当前 Route）。
    return { routeKey: nextRouteKey, exploration: baseExploration };
  }
  if (baseExploration.get(toggle.scopeKey) === toggle.branchId) {
    // 删除 scopeKey 指向自身的条目，并清理 branch 子树内全部 exploration scope。
    baseExploration.delete(toggle.scopeKey);
    removeBranchSubtree(baseExploration, toggle.branchId, context.descendantBranchIds);
  }
  return { routeKey: nextRouteKey, exploration: baseExploration };
}

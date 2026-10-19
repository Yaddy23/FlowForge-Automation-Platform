import { registerAction, type ActionHandler } from '../../actions/registry';
import { evaluateCondition, type ConditionSpec } from '../../conditions/operators';

export interface BranchConfig {
  branches?: { id: string; conditions: ConditionSpec[]; combinator: 'and' | 'or' }[];
  fallbackBranchId?: string;
}

/**
 * Picks the first branch whose conditions pass under its combinator; returns
 * fallbackBranchId when none match (null when there is no fallback → the
 * walk simply takes no outgoing edge from this node).
 */
export function selectBranch(config: BranchConfig, ctx: Parameters<ActionHandler>[1]): string | null {
  for (const branch of config.branches ?? []) {
    const results = branch.conditions.map((c) => evaluateCondition(c, ctx));
    const matched =
      branch.combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
    if (matched) return branch.id;
  }
  return config.fallbackBranchId ?? null;
}

/**
 * `branch` node (if/else): outgoing edges follow when their sourceHandle
 * equals the selected branch id (or the fallback id when nothing matched).
 * Edges with any other/absent handle follow unconditionally.
 */
export const branchHandler: ActionHandler = async (config, ctx) => {
  const branchId = selectBranch(config as BranchConfig, ctx);
  ctx.logger.info(`Branch selected: ${branchId ?? '(none)'}`);
  return { output: { branchId } };
};

export function registerBranchHandler(): void {
  registerAction('branch', branchHandler);
}

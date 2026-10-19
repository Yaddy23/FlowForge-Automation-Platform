import { registerAction, type ActionHandler } from '../../actions/registry';
import { evaluateCondition } from '../../conditions/operators';
import { getPath } from '../template';

/**
 * `condition` node: evaluates one condition and routes the walk — outgoing
 * edges with sourceHandle 'true' follow on pass, 'false' on fail, any other
 * handle always. The decision is recorded on the nodeRun output.
 */
export const conditionHandler: ActionHandler = async (config, ctx) => {
  const leftPath = String(config.leftPath ?? '');
  const operator = String(config.operator ?? '');
  const passed = evaluateCondition({ leftPath, operator, right: config.right }, ctx);
  ctx.logger.info(`Condition ${leftPath} ${operator} → ${passed ? 'true' : 'false'}`);
  return { output: { passed, leftPath, operator } };
};

/** Convenience for tests/tools: resolve what the left path points at. */
export function resolveLeft(config: Record<string, unknown>, ctx: { payload?: unknown; vars?: Record<string, unknown>; outputs?: Record<string, unknown> }): unknown {
  return getPath(ctx, String(config.leftPath ?? ''));
}

export function registerConditionHandler(): void {
  registerAction('condition', conditionHandler);
}

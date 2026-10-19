import { registerAction, type ActionHandler } from './registry';
import { getOperator } from '../conditions/operators';
import { getPath, type TemplateScope } from '../workflow-engine/template';
import { ActionError } from './errors';

/**
 * action.filter — keeps the items of an array (dot-path into the run scope)
 * matching a structured condition. No expression strings, no eval: the same
 * operator registry as condition nodes (Task 9) evaluates each item.
 * Output: { kept, total, items } — downstream nodes read `outputs.<id>.items`.
 */
const filterAction: ActionHandler = async (config, ctx) => {
  const inputPath = String(config.inputPath ?? '');
  const operatorName = String(config.operator ?? '');
  const operator = getOperator(operatorName);
  if (!operator) {
    throw new ActionError('FILTER_OPERATOR', `unknown filter operator "${operatorName}"`);
  }

  const scope: TemplateScope = { payload: ctx.payload, vars: ctx.vars, outputs: ctx.nodeOutputs };
  const items = getPath(scope, inputPath);
  if (!Array.isArray(items)) {
    throw new ActionError('FILTER_INPUT', `"${inputPath}" did not resolve to an array`);
  }

  const itemPath = typeof config.path === 'string' && config.path ? config.path : undefined;
  const kept = items.filter((item) => {
    const left = itemPath ? getPath(item, itemPath) : item;
    return operator(left, config.value);
  });

  return { output: { kept: kept.length, total: items.length, items: kept } };
};

export function registerFilterAction(): void {
  registerAction('action.filter', filterAction);
}

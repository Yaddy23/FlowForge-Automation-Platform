import { registerAction, type ActionHandler } from './registry';

/**
 * action.report — summarizes the run so far: title, timestamp, and every
 * upstream node output keyed by nodeId. The engine resolves upstream outputs
 * into ctx.nodeOutputs before this node runs, so the report is the
 * single-stop payload for the weekly-report template (Task 13).
 */
const reportAction: ActionHandler = async (config, ctx) => {
  const title = String(config.title ?? 'Workflow report');
  return {
    output: {
      title,
      generatedAt: new Date().toISOString(),
      data: { ...ctx.nodeOutputs },
    },
  };
};

export function registerReportAction(): void {
  registerAction('action.report', reportAction);
}

import { registerAction, type ActionHandler } from './registry';
import { resolveTemplate } from '../workflow-engine/template';

/**
 * Minimal action set for Task 8: the engine's dispatch depends on the actions
 * registry, so it lands here with `action.log`. The full library (email,
 * notify, webhook-out, transform, …) registers into this same registry in
 * Task 10.
 */
export const logAction: ActionHandler = async (config, ctx) => {
  const message = resolveTemplate(String(config.message ?? ''), ctx);
  ctx.logger.info(message);
  return { output: { message } };
};

export function registerBuiltInActions(): void {
  registerAction('action.log', logAction);
}

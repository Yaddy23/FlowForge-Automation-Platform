import { registerAction, type ActionHandler } from './registry';

/**
 * action.delay — pauses the run. The handler returns a `delayedForMs` marker;
 * the engine (not the handler) transitions the run to `waiting`, persists the
 * node outputs onto the run doc, and enqueues a delayed BullMQ continuation
 * job that calls executeRun again. The node run itself records `succeeded`.
 */
const delayAction: ActionHandler = async (config) => {
  const durationMs = Number(config.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw Object.assign(new Error('delay requires a positive "durationMs"'), { code: 'DELAY_CONFIG' });
  }
  return { output: { delayedForMs: Math.floor(durationMs) } };
};

export function registerDelayAction(): void {
  registerAction('action.delay', delayAction);
}

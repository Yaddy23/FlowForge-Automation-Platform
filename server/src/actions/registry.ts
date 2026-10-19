import type { RunContext } from '../workflow-engine/context';

/**
 * A node handler executes one workflow node: it receives the (template-
 * resolved) node config and the run context, and returns the node's output.
 * Outputs become `ctx.nodeOutputs[nodeId]` for downstream nodes.
 */
export type ActionHandler = (
  config: Record<string, unknown>,
  ctx: RunContext
) => Promise<{ output: Record<string, unknown> }>;

const handlers = new Map<string, ActionHandler>();

/** Registers (or replaces) the handler for a node kind. */
export function registerAction(kind: string, handler: ActionHandler): void {
  handlers.set(kind, handler);
}

export function getActionHandler(kind: string): ActionHandler | undefined {
  return handlers.get(kind);
}

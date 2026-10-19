import { z } from 'zod';
import type { NodeKind } from 'shared/types/workflow';

export type NodeCategory = 'trigger' | 'condition' | 'action' | 'logic';

export interface NodeSpec {
  category: NodeCategory;
  /** Zod schema validating the node's config object. */
  config: z.ZodTypeAny;
}

/**
 * Per-node-kind Zod config schemas. This registry is the single source of
 * truth: the validator (Task 5), the executor (Task 8), and the condition
 * and action handlers (Tasks 9-10) all register into and read from it.
 *
 * Kinds whose configs are finalized in later tasks stay permissive
 * (passthrough) for now and tighten as those tasks land.
 */
export const nodeRegistry: Record<NodeKind, NodeSpec> = {
  // Triggers
  'trigger.manual': { category: 'trigger', config: z.object({}).passthrough() },
  'trigger.schedule': {
    category: 'trigger',
    config: z
      .object({
        type: z.enum(['once', 'hourly', 'daily', 'weekly', 'monthly', 'cron']).optional(),
        cron: z.string().optional(),
        timezone: z.string().optional(),
      })
      .passthrough(),
  },
  'trigger.webhook': { category: 'trigger', config: z.object({}).passthrough() },
  'trigger.event': {
    category: 'trigger',
    config: z.object({ eventName: z.string().min(1) }).passthrough(),
  },

  // Logic
  condition: {
    category: 'condition',
    config: z
      .object({ leftPath: z.string().min(1), operator: z.string().min(1) })
      .passthrough(),
  },
  branch: {
    category: 'logic',
    config: z
      .object({
        branches: z
          .array(z.object({ id: z.string().min(1) }).passthrough())
          .optional(),
        fallbackBranchId: z.string().optional(),
      })
      .passthrough(),
  },

  // Actions
  'action.email': {
    category: 'action',
    config: z
      .object({
        to: z.string().min(1),
        subject: z.string().min(1),
        body: z.string().optional(),
      })
      .passthrough(),
  },
  'action.notify': {
    category: 'action',
    config: z.object({ message: z.string().min(1) }).passthrough(),
  },
  'action.webhook': {
    category: 'action',
    config: z
      .object({ url: z.string().url(), method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).optional() })
      .passthrough(),
  },
  'action.transform': { category: 'action', config: z.object({}).passthrough() },
  'action.filter': { category: 'action', config: z.object({}).passthrough() },
  'action.validate': { category: 'action', config: z.object({}).passthrough() },
  'action.report': { category: 'action', config: z.object({}).passthrough() },
  'action.csv': { category: 'action', config: z.object({}).passthrough() },
  'action.delay': {
    category: 'action',
    config: z.object({ durationMs: z.number().int().positive() }).passthrough(),
  },
  'action.log': { category: 'action', config: z.object({}).passthrough() },
  'action.reference': { category: 'action', config: z.object({}).passthrough() },
  'action.record.create': {
    category: 'action',
    config: z
      .object({ collection: z.string().min(1), data: z.record(z.unknown()) })
      .passthrough(),
  },
  'action.record.update': {
    category: 'action',
    config: z
      .object({
        collection: z.string().min(1),
        filter: z.record(z.unknown()),
        data: z.record(z.unknown()),
      })
      .passthrough(),
  },
};

export function getNodeSpec(kind: string): NodeSpec | undefined {
  return (nodeRegistry as Record<string, NodeSpec>)[kind];
}

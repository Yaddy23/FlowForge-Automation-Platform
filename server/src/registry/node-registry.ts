import { z } from 'zod';
import type { NodeKind } from 'shared/types/workflow';
import { getOperator } from '../conditions/operators';

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
  'trigger.webhook': {
    category: 'trigger',
    config: z
      .object({
        // Unique token for webhook security (can be left empty for auto-generated)
        token: z.string().min(1).optional(),
        // HMAC secret for signature verification
        hmacSecret: z.string().min(1).optional(),
        // Rate limit: max requests per time window
        rateLimit: z.number().int().positive().default(100),
        // Rate limit window in seconds
        rateLimitWindow: z.number().int().positive().default(60),
        // Enable signature verification
        verifySignature: z.boolean().default(true),
        // Optional: allowed IPs or CIDR ranges for additional security
        allowedIps: z.array(z.string().ip()).optional(),
        // Webhook ID (if different from auto-generated)
        webhookId: z.string().min(1).optional(),
      })
      .passthrough(),
  },
  'trigger.event': {
    category: 'trigger',
    config: z.object({ eventName: z.string().min(1) }).passthrough(),
  },

  // Logic
  condition: {
    category: 'condition',
    config: z
      .object({
        leftPath: z.string().min(1),
        operator: z.string().refine((op) => !!getOperator(op), 'Unknown operator'),
        right: z.unknown().optional(),
      })
      .passthrough(),
  },
  branch: {
    category: 'logic',
    config: z
      .object({
        // Validated when present; empty-config branch nodes (cycle breakers)
        // stay legal — they route via unconditional edges.
        branches: z
          .array(
            z.object({
              id: z.string().min(1),
              combinator: z.enum(['and', 'or']),
              conditions: z
                .array(
                  z.object({
                    leftPath: z.string().min(1),
                    operator: z.string().refine((op) => !!getOperator(op), 'Unknown operator'),
                    right: z.unknown().optional(),
                  })
                )
                .min(1),
            })
          )
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
  'action.transform': {
    category: 'action',
    config: z.object({ mappings: z.record(z.unknown()) }).passthrough(),
  },
  'action.filter': {
    category: 'action',
    config: z
      .object({
        inputPath: z.string().min(1),
        path: z.string().optional(),
        operator: z.string().refine((op) => !!getOperator(op), 'Unknown operator'),
        value: z.unknown().optional(),
      })
      .passthrough(),
  },
  'action.validate': {
    category: 'action',
    config: z
      .object({
        schema: z.record(z.unknown()),
        data: z.unknown().optional(),
        inputPath: z.string().optional(),
      })
      .passthrough(),
  },
  'action.map-fields': {
    category: 'action',
    config: z
      .object({
        inputPath: z.string().optional(),
        mapping: z.record(z.string()),
      })
      .passthrough(),
  },
  'action.format-date': {
    category: 'action',
    config: z
      .object({
        value: z.string().min(1),
        format: z.string().optional(),
        timezone: z.string().optional(),
      })
      .passthrough(),
  },
  'action.report': { category: 'action', config: z.object({ title: z.string().optional() }).passthrough() },
  'action.csv': {
    category: 'action',
    config: z
      .object({
        operation: z.enum(['parse', 'generate']),
        data: z.string().optional(),
        inputPath: z.string().optional(),
      })
      .passthrough(),
  },
  'action.delay': {
    category: 'action',
    config: z
      .object({ durationMs: z.number().int().positive().max(2_147_483_647) })
      .passthrough(),
  },
  'action.log': { category: 'action', config: z.object({}).passthrough() },
  'action.reference': { category: 'action', config: z.object({ prefix: z.string().optional() }).passthrough() },
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
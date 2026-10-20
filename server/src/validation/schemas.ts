import { z } from 'zod';

/** MongoDB ObjectId shape. */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// ─── Auth ──────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(2048),
});

// ─── Workflow ──────────────────────────────────────────────────────────
// Mirrors shared/types/workflow.ts WorkflowNode/WorkflowEdge/WorkflowDefinition
export const workflowNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(100),
  config: z.record(z.unknown()),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  sourceHandle: z.string().max(100).optional(),
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(workflowNodeSchema).max(500),
  edges: z.array(workflowEdgeSchema).max(1000),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  definition: workflowDefinitionSchema.optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

export const saveVersionSchema = z.object({
  definition: workflowDefinitionSchema,
});

export const restoreVersionSchema = z.object({
  versionId: objectIdSchema.optional(),
});

export const executeWorkflowSchema = z
  .object({
    payload: z.unknown().optional(),
  })
  .default({});

export const versionParamsSchema = z.object({
  id: objectIdSchema,
  version1: z.string().max(20).optional(),
  version2: z.string().max(20).optional(),
  version: z.string().max(20).optional(),
});

// ─── Credentials ───────────────────────────────────────────────────────
export const createCredentialSchema = z.object({
  name: z.string().min(1).max(200),
  credentialType: z.string().min(1).max(100),
  value: z.string().min(1).max(10000),
});

// ─── Users ─────────────────────────────────────────────────────────────
export const roleSchema = z.enum(['super_admin', 'workflow_admin', 'workflow_builder', 'viewer']);

export const createUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: roleSchema,
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: roleSchema.optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  search: z.string().max(200).optional(),
  role: roleSchema.optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
  action: z.string().max(200).optional(),
  targetType: z.string().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  keys: z.string().max(1000).optional(),
});

// ─── User preferences ──────────────────────────────────────────────────
export const updatePreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  notificationFrequency: z.enum(['immediate', 'hourly', 'daily']).optional(),
});

// ─── Settings ──────────────────────────────────────────────────────────
export const setSettingSchema = z.object({
  key: z.string().min(1).max(200).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Key must be alphanumeric/underscore'),
  value: z.unknown(),
  description: z.string().max(500).optional(),
});

export const settingKeyParamSchema = z.object({
  key: z.string().min(1).max(200),
});

// ─── Events ────────────────────────────────────────────────────────────
export const publishEventSchema = z.object({
  eventName: z.string().min(1).max(200),
  eventId: z.string().min(1).max(200).optional(),
  payload: z.record(z.unknown()).optional(),
});

// ─── Schedules ─────────────────────────────────────────────────────────
export const scheduleSchema = z.object({
  type: z.enum(['once', 'hourly', 'daily', 'weekly', 'monthly', 'cron']),
  cron: z.string().max(200).optional(),
  timezone: z.string().max(100).optional(),
  enabled: z.boolean().optional(),
});

// ─── Templates ─────────────────────────────────────────────────────────
export const instantiateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

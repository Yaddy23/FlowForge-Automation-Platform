import mongoose, { Schema } from 'mongoose';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'event';

export interface IWorkflowRun {
  workflow: mongoose.Types.ObjectId;
  workflowVersion: number;
  status: RunStatus;
  trigger: { type: TriggerType; payload: unknown };
  idempotencyKey: string;
  createdBy: mongoose.Types.ObjectId;
  timeoutMs: number;
  error?: { code: string; message: string } | null;
  startedAt?: Date;
  finishedAt?: Date;
  /**
   * Server-only snapshot of node outputs, persisted when the run pauses in
   * `waiting` (action.delay) so the resume pass can restore context. Never
   * returned through the API (Task 11 must strip it from run responses).
   */
  nodeOutputs?: Record<string, unknown>;
}

const workflowRunSchema = new Schema<IWorkflowRun>(
  {
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
    workflowVersion: { type: Number, required: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'timed_out'],
      default: 'queued',
      index: true,
    },
    trigger: {
      type: {
        type: String,
        enum: ['manual', 'schedule', 'webhook', 'event'],
        required: true,
      },
      payload: { type: Schema.Types.Mixed, default: {} },
    },
    idempotencyKey: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    timeoutMs: { type: Number, default: () => parseInt(process.env.RUN_TIMEOUT_MS ?? '300000', 10) },
    error: {
      type: { code: String, message: String },
      default: null,
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    nodeOutputs: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

workflowRunSchema.index({ workflow: 1, createdAt: -1 });
// Idempotent fan-out (Task 14): one run per idempotency key.
workflowRunSchema.index({ idempotencyKey: 1 }, { unique: true });

const WorkflowRun = mongoose.model<IWorkflowRun>('WorkflowRun', workflowRunSchema);
export default WorkflowRun;

import mongoose, { Schema } from 'mongoose';

export type NodeRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';

export interface IWorkflowNodeRun {
  run: mongoose.Types.ObjectId;
  workflow: mongoose.Types.ObjectId;
  nodeId: string;
  kind: string;
  status: NodeRunStatus;
  inputSummary?: string;
  outputSummary?: string;
  error?: { code: string; message: string } | null;
  startedAt?: Date;
  finishedAt?: Date;
  attempts: number;
}

const workflowNodeRunSchema = new Schema<IWorkflowNodeRun>(
  {
    run: { type: Schema.Types.ObjectId, ref: 'WorkflowRun', required: true, index: true },
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
    nodeId: { type: String, required: true },
    kind: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'],
      default: 'pending',
    },
    // Redacted, truncated JSON snapshots (Task 8 redact.ts) — never raw secrets.
    inputSummary: { type: String },
    outputSummary: { type: String },
    error: {
      type: { code: String, message: String },
      default: null,
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

workflowNodeRunSchema.index({ run: 1, nodeId: 1 });

const WorkflowNodeRun = mongoose.model<IWorkflowNodeRun>('WorkflowNodeRun', workflowNodeRunSchema);
export default WorkflowNodeRun;

import mongoose, { Schema } from 'mongoose';

export interface IWorkflowVersion {
  workflow: mongoose.Types.ObjectId;
  version: number;
  definition: unknown;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const workflowVersionSchema = new Schema<IWorkflowVersion>(
  {
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
    version: { type: Number, required: true },
    definition: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Immutable versions: (workflow, version) is unique
workflowVersionSchema.index({ workflow: 1, version: 1 }, { unique: true });

const WorkflowVersion = mongoose.model<IWorkflowVersion>('WorkflowVersion', workflowVersionSchema);
export default WorkflowVersion;

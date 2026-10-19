import mongoose, { Schema } from 'mongoose';

export interface IWorkflow {
  name: string;
  description?: string;
  owner: mongoose.Types.ObjectId;
  status: 'draft' | 'active' | 'archived';
  latestVersion: number;
  activeVersion: number | null;
}

const workflowSchema = new Schema<IWorkflow>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    latestVersion: { type: Number, default: 0 },
    activeVersion: { type: Number, default: null },
  },
  { timestamps: true }
);

const Workflow = mongoose.model<IWorkflow>('Workflow', workflowSchema);
export default Workflow;

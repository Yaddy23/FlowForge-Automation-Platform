import mongoose, { Schema } from 'mongoose';

export interface IWorkflowTemplate {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  definition: unknown;
}

const workflowTemplateSchema = new Schema<IWorkflowTemplate>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    definition: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const WorkflowTemplate = mongoose.model<IWorkflowTemplate>('WorkflowTemplate', workflowTemplateSchema);
export default WorkflowTemplate;
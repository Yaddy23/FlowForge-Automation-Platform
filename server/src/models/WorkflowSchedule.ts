import mongoose, { Schema } from 'mongoose';

export interface IWorkflowSchedule {
  workflow: mongoose.Types.ObjectId;
  type: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'cron';
  cron?: string;
  timezone: string;
  nextRunAt?: Date | null;
  enabled: boolean;
}

const workflowScheduleSchema = new Schema<IWorkflowSchedule>(
  {
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
    type: {
      type: String,
      enum: ['once', 'hourly', 'daily', 'weekly', 'monthly', 'cron'],
      required: true,
    },
    cron: { type: String },
    timezone: { type: String, default: 'UTC' },
    nextRunAt: { type: Date, default: null },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const WorkflowSchedule = mongoose.model<IWorkflowSchedule>('WorkflowSchedule', workflowScheduleSchema);
export default WorkflowSchedule;

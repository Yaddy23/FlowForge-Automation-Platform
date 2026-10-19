import mongoose, { Schema } from 'mongoose';

export interface IRunLog {
  run: mongoose.Types.ObjectId;
  /** Redacted NDJSON lines written by the run logger (one executeRun pass). */
  lines: string[];
  createdAt: Date;
}

const runLogSchema = new Schema<IRunLog>(
  {
    run: { type: Schema.Types.ObjectId, ref: 'WorkflowRun', required: true, unique: true, index: true },
    lines: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const RunLog = mongoose.model<IRunLog>('RunLog', runLogSchema);
export default RunLog;

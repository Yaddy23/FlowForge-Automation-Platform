import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actorId: Schema.Types.ObjectId; // Reference to User
  action: string;
  targetType: string;
  targetId?: Schema.Types.ObjectId; // Optional reference to any target
  meta?: Record<string, any>;
}

const AuditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: Schema.Types.ObjectId, refPath: 'targetType' }, // RefPath allows dynamic reference
  meta: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default model<IAuditLog>('AuditLog', AuditLogSchema);
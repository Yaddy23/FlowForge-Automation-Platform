import { Schema, model, Document } from 'mongoose';

export interface ISettings extends Document {
  key: string;
  value: any;
  description?: string;
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  description: { type: String }
}, { timestamps: true });

export default model<ISettings>('Settings', SettingsSchema);

import { Schema, model, Document } from 'mongoose';
import { Types } from 'mongoose';
import User from './User';

export interface IUserPreferences extends Document {
  userId: Types.ObjectId;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  notificationFrequency: 'immediate' | 'hourly' | 'daily';
  updatedAt: Date;
}

const UserPreferencesSchema = new Schema<IUserPreferences>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  emailNotifications: { type: Boolean, default: true },
  inAppNotifications: { type: Boolean, default: true },
  notificationFrequency: { type: String, enum: ['immediate', 'hourly', 'daily'], default: 'immediate' }
}, { timestamps: true });

export default model<IUserPreferences>('UserPreferences', UserPreferencesSchema);

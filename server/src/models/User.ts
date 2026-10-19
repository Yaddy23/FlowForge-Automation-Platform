import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type Role = 'super_admin' | 'workflow_admin' | 'workflow_builder' | 'viewer';

export interface IUser extends Document {
  email: string;
  name: string;
  password: string;
  role: Role;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['super_admin', 'workflow_admin', 'workflow_builder', 'viewer'], default: 'viewer' }
}, { timestamps: true });

// Pre-save hook to hash password
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
UserSchema.methods.comparePassword = function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default model<IUser>('User', UserSchema);
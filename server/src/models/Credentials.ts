import { Schema, model, Document } from 'mongoose';
import { randomBytes } from 'crypto';
import Workflow from './Workflow';

export interface ICredentials extends Document {
  name: string;
  credentialType: string; // e.g., 'api-key', 'oauth-token', 'basic-auth', 'bearer-token'
  encryptedData: Buffer; // Encrypted credential value (ciphertext)
  iv: Buffer; // Initialization vector for AES-GCM
  tag: Buffer; // Authentication tag for AES-GCM
  createdBy: typeof Workflow.schema.obj.owner; // Reference to User
  createdAt: Date;
  updatedAt: Date;
}

const CredentialsSchema = new Schema<ICredentials>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    credentialType: {
      type: String,
      required: true,
      enum: ['api-key', 'oauth-token', 'basic-auth', 'bearer-token', 'custom'],
    },
    encryptedData: {
      type: Buffer,
      required: true,
    },
    iv: {
      type: Buffer,
      required: true,
    },
    tag: {
      type: Buffer,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for looking up credentials by name and user
CredentialsSchema.index({ name: 1, createdBy: 1 }, { unique: true });

export const Credentials = model<ICredentials>('Credentials', CredentialsSchema);
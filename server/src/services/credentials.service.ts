import { Credentials, ICredentials } from '../models/Credentials';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import Workflow from '../models/Workflow';

/**
 * Returns the 32-byte encryption key from CRED_ENCRYPTION_KEY.
 * Validated lazily so importing this module never throws when the key is
 * unset (e.g., in test environments that never touch credentials).
 */
function getKey(): Buffer {
  const key = process.env.CRED_ENCRYPTION_KEY;
  if (!key || key.length !== 32) {
    throw new Error('CRED_ENCRYPTION_KEY must be set and be 32 bytes long');
  }
  return Buffer.from(key, 'utf8');
}

/**
 * Service for handling encrypted credentials using AES-256-GCM.
 * Credentials are never returned in plaintext to prevent leakage.
 */
export class CredentialsService {
  /**
   * Encrypt a credential value using AES-256-GCM.
   * Returns the encrypted data, IV, and authentication tag.
   */
  static encryptCredential(value: string): {
    encryptedData: Buffer;
    iv: Buffer;
    tag: Buffer;
  } {
    const iv = randomBytes(12); // GCM recommended IV length
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
    const encryptedData = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      encryptedData,
      iv,
      tag,
    };
  }

  /**
   * Decrypt a credential value using AES-256-GCM.
   * This should only be used internally when the credential is needed
   * for outbound requests (e.g., in an action). Never return decrypted
   * values to the frontend.
   */
  static decryptCredential(
    encryptedData: Buffer,
    iv: Buffer,
    tag: Buffer
  ): string {
    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /**
   * Create a new encrypted credential.
   * @param name Human-readable name for the credential
   * @param credentialType Type of credential (api-key, oauth-token, etc.)
   * @param value The plaintext credential value to encrypt
   * @param createdBy User ID of the creator
   * @returns The created credential document (without decryptable data)
   */
  static async createCredential(
    name: string,
    credentialType: string,
    value: string,
    createdBy: typeof Workflow.schema.obj.owner
  ): Promise<ICredentials> {
    const { encryptedData, iv, tag } = this.encryptCredential(value);

    const credential = new Credentials({
      name,
      credentialType,
      encryptedData,
      iv,
      tag,
      createdBy,
    });

    return await credential.save();
  }

  /**
   * Get a credential by name and user, returning only metadata.
   * The decryptable fields are excluded to prevent accidental leakage.
   */
  static async getCredentialByNameAndUser(
    name: string,
    userId: typeof Workflow.schema.obj.owner
  ): Promise<Pick<ICredentials, '_id' | 'name' | 'credentialType' | 'createdAt' | 'updatedAt'> | null> {
    const credential = await Credentials.findOne(
      { name, createdBy: userId },
      '-encryptedData -iv -tag -__v' // Exclude decryptable fields
    ).lean();

    return credential ?? null;
  }

  /**
   * Get the decryptable credential data for internal use only.
   * This should only be used when the credential is needed for
   * an outbound request (e.g., in an action handler).
   * @param credentialId The credential ID
   * @param userId The user ID (for authorization check)
   * @returns The decrypted credential value, or null if not found/unauthorized
   */
  static async getDecryptedCredential(
    credentialId: string,
    userId: typeof Workflow.schema.obj.owner
  ): Promise<string | null> {
    const credential = await Credentials.findOne({
      _id: credentialId,
      createdBy: userId,
    });

    if (!credential) {
      return null;
    }

    return this.decryptCredential(
      credential.encryptedData,
      credential.iv,
      credential.tag
    );
  }

  /**
   * Delete a credential by ID and user (authorization check).
   */
  static async deleteCredential(
    credentialId: string,
    userId: typeof Workflow.schema.obj.owner
  ): Promise<boolean> {
    const result = await Credentials.deleteOne({
      _id: credentialId,
      createdBy: userId,
    });
    return result.deletedCount === 1;
  }

  /**
   * List all credentials for a user (metadata only).
   */
  static async listCredentialsByUser(
    userId: typeof Workflow.schema.obj.owner
  ): Promise<Pick<ICredentials, '_id' | 'name' | 'credentialType' | 'createdAt' | 'updatedAt'>[]> {
    return await Credentials.find(
      { createdBy: userId },
      '-encryptedData -iv -tag -__v'
    ).sort({ createdAt: -1 }).lean();
  }
}
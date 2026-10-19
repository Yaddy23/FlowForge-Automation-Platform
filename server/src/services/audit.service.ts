import { Types } from 'mongoose';
import AuditLog from '../models/AuditLog';

/**
 * Log an audit entry
 * @param actorId - The ID of the user performing the action
 * @param action - The action performed (e.g., 'CREATE_USER')
 * @param targetType - The type of target (e.g., 'User', 'Workflow')
 * @param targetId - The ID of the target (optional)
 * @param meta - Additional metadata (optional)
 */
export const logAudit = async (
  actorId: string | Types.ObjectId,
  action: string,
  targetType: string,
  targetId?: string | Types.ObjectId,
  meta: Record<string, any> = {}
) => {
  try {
    const auditLog = new AuditLog({
      actorId: typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId,
      action,
      targetType,
      targetId: targetId ? (typeof targetId === 'string' ? new Types.ObjectId(targetId) : targetId) : undefined,
      meta
    });
    await auditLog.save();
  } catch (error) {
    // Log error but don't throw to avoid breaking the main flow
    console.error('Failed to log audit:', error);
  }
};
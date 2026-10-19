import { randomBytes } from 'crypto';
import { registerAction, type ActionHandler } from './registry';

/**
 * action.reference — generates a human-readable reference like
 * `FF-LX3K9Q2A-4F2B` (<prefix>-<base36 timestamp>-<4 hex chars>). Timestamp
 * keeps references roughly sortable; the random suffix prevents collisions
 * within the same millisecond.
 */
const generateReferenceAction: ActionHandler = async (config) => {
  const prefix = (typeof config.prefix === 'string' && config.prefix ? config.prefix : 'FF').toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return { output: { reference: `${prefix}-${ts}-${rand}` } };
};

export function registerGenerateReferenceAction(): void {
  registerAction('action.reference', generateReferenceAction);
}

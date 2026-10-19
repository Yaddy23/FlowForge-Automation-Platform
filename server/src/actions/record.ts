import mongoose from 'mongoose';
import { registerAction, type ActionHandler } from './registry';
import { isAllowedRecordCollection } from '../config/allowed-records';
import { ActionError } from './errors';

/**
 * action.record.create / action.record.update — write app records from a
 * workflow. Only whitelisted collections (see allowed-records.ts) are
 * writable; platform collections (users, workflowruns, …) are refused.
 */
const recordCreateAction: ActionHandler = async (config) => {
  const collection = String(config.collection ?? '');
  if (!isAllowedRecordCollection(collection)) {
    throw new ActionError('RECORD_COLLECTION_NOT_ALLOWED', `"${collection}" is not a writable collection`);
  }
  const data = (config.data ?? {}) as Record<string, unknown>;
  const res = await mongoose.connection.db!.collection(collection).insertOne({ ...data });
  return { output: { insertedId: String(res.insertedId) } };
};

const recordUpdateAction: ActionHandler = async (config) => {
  const collection = String(config.collection ?? '');
  if (!isAllowedRecordCollection(collection)) {
    throw new ActionError('RECORD_COLLECTION_NOT_ALLOWED', `"${collection}" is not a writable collection`);
  }
  const filter = (config.filter ?? {}) as Record<string, unknown>;
  const data = (config.data ?? {}) as Record<string, unknown>;
  const res = await mongoose.connection.db!.collection(collection).updateMany(filter, { $set: data });
  return { output: { matched: res.matchedCount, modified: res.modifiedCount } };
};

export function registerRecordActions(): void {
  registerAction('action.record.create', recordCreateAction);
  registerAction('action.record.update', recordUpdateAction);
}

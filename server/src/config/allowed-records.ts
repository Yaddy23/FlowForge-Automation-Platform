/**
 * Collections the record create/update actions may write. Workflow-internal
 * collections (users, workflowruns, credentials, …) are never writable from
 * a definition — the whitelist is the whole guard.
 */
export const ALLOWED_RECORD_COLLECTIONS = ['records'] as const;

export function isAllowedRecordCollection(name: string): boolean {
  return (ALLOWED_RECORD_COLLECTIONS as readonly string[]).includes(name);
}

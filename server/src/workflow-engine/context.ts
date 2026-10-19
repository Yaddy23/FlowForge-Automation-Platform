import type mongoose from 'mongoose';
import type { IWorkflow } from '../models/Workflow';
import type { IWorkflowRun } from '../models/WorkflowRun';
import type { WorkflowDefinition } from 'shared/types/workflow';
import type { TemplateScope } from './template';
import { redact } from './redact';

export interface RunLogger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  /** Redacted structured log lines, persisted for the execution log (Task 11). */
  lines: string[];
}

export interface RunContext extends TemplateScope {
  workflow: IWorkflow;
  version: { version: number; definition: WorkflowDefinition };
  run: IWorkflowRun & mongoose.Document;
  /** Alias for `payload` readability in handlers. */
  triggerPayload: unknown;
  vars: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  logger: RunLogger;
}

export function createLogger(runId: string): RunLogger {
  const lines: string[] = [];
  const write = (level: string, message: string, meta?: unknown) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      runId,
      message,
      ...(meta !== undefined ? { meta: redact(meta) } : {}),
    });
    lines.push(line);
  };
  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    lines,
  };
}

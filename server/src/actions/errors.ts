/**
 * Error with a stable machine code — the engine lifts `err.code` into the
 * WorkflowNodeRun error record and the run's failure.
 */
export class ActionError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.code = code;
  }
}

const SENSITIVE_KEY = /password|secret|token|authorization|credential/i;

/**
 * Deep-clones a value, replacing the values of keys that look secret with
 * '[REDACTED]'. Applied to everything that leaves the engine: node-run
 * input/output summaries, log lines, error messages' metadata.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(val);
    }
    return out;
  }
  return value;
}

/**
 * Redacted, size-capped JSON snapshot for persistence on run/node records.
 */
export function summarize(value: unknown, maxLen = 512): string {
  let json: string;
  try {
    json = JSON.stringify(redact(value)) ?? 'undefined';
  } catch {
    json = '"[unserializable]"';
  }
  if (json.length > maxLen) {
    return `${json.slice(0, maxLen)}…[truncated ${json.length - maxLen} chars]`;
  }
  return json;
}

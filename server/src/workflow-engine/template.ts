/**
 * Template scope: what `{{...}}` placeholders may reference. The engine builds
 * this from the run context — the trigger payload, per-run variables, and
 * upstream node outputs.
 */
export interface TemplateScope {
  payload?: unknown;
  vars?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Dot-path lookup that walks plain objects and arrays ('items.0.name'). */
export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

/**
 * Safe template resolver: replaces {{dot.path}} placeholders with values
 * looked up by dot path against the scope only. No eval, no code execution;
 * unresolvable placeholders are left in place so misconfigurations stay
 * visible in outputs and logs.
 */
export function resolveTemplate(template: string, scope: TemplateScope): string {
  return template.replace(PLACEHOLDER, (match, path: string) => {
    const value = stringify(getPath(scope, path));
    return value === null ? match : value;
  });
}

/**
 * Walks a config object and resolves templates in every string value.
 * Config keys are not redacted here — resolution is structural, never code.
 */
export function resolveTemplatesDeep<T>(value: T, scope: TemplateScope): T {
  if (typeof value === 'string') return resolveTemplate(value, scope) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => resolveTemplatesDeep(v, scope)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveTemplatesDeep(val, scope);
    }
    return out as unknown as T;
  }
  return value;
}

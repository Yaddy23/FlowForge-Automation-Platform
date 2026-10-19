import { getPath, resolveTemplate, type TemplateScope } from '../workflow-engine/template';

/**
 * Operator registry for condition nodes and branch conditions (Task 9).
 * Pure functions — no eval, no config-controlled code paths; the registry is
 * the only dispatch surface.
 */
export type OperatorFn = (left: unknown, right: unknown) => boolean;

export interface ConditionSpec {
  leftPath: string;
  operator: string;
  right?: unknown;
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function primitiveString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return null;
  return String(value);
}

/** Equality tolerant of template-stringified rights: 3 equals "3". */
function looseEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const l = primitiveString(left);
  const r = primitiveString(right);
  return l !== null && r !== null && l === r;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export const OPERATORS: Record<string, OperatorFn> = {
  equals: (left, right) => looseEquals(left, right),
  not_equals: (left, right) => !looseEquals(left, right),
  gt: (left, right) => {
    const l = asNumber(left);
    const r = asNumber(right);
    return l !== null && r !== null && l > r;
  },
  lt: (left, right) => {
    const l = asNumber(left);
    const r = asNumber(right);
    return l !== null && r !== null && l < r;
  },
  contains: (left, right) => {
    if (Array.isArray(left)) return left.includes(right);
    return String(left ?? '').includes(String(right ?? ''));
  },
  not_contains: (left, right) => !OPERATORS.contains(left, right),
  starts_with: (left, right) => String(left ?? '').startsWith(String(right ?? '')),
  ends_with: (left, right) => String(left ?? '').endsWith(String(right ?? '')),
  is_empty: (left) => isBlank(left),
  is_not_empty: (left) => !isBlank(left),
  date_before: (left, right) => {
    const l = asDate(left);
    const r = asDate(right);
    return l !== null && r !== null && l.getTime() < r.getTime();
  },
  date_after: (left, right) => {
    const l = asDate(left);
    const r = asDate(right);
    return l !== null && r !== null && l.getTime() > r.getTime();
  },
  is_true: (left) => asBoolean(left) === true,
  is_false: (left) => asBoolean(left) === false,
};

export function getOperator(name: string): OperatorFn | undefined {
  return OPERATORS[name];
}

export class ConditionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Resolves `leftPath` against the template scope, template-resolves `right`,
 * and applies the operator. Throws ConditionError('UNKNOWN_OPERATOR') for an
 * unregistered operator name.
 */
export function evaluateCondition(spec: ConditionSpec, scope: TemplateScope): boolean {
  const operator = OPERATORS[spec.operator];
  if (!operator) {
    throw new ConditionError(
      'UNKNOWN_OPERATOR',
      `UNKNOWN_OPERATOR: unknown condition operator "${spec.operator}"`
    );
  }
  const left = getPath(scope, spec.leftPath);
  const right =
    typeof spec.right === 'string' ? resolveTemplate(spec.right, scope) : spec.right;
  return operator(left, right);
}

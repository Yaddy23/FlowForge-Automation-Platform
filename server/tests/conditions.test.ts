import { describe, it, expect } from 'vitest';
import {
  OPERATORS,
  getOperator,
  evaluateCondition,
  type ConditionSpec,
} from '../src/conditions/operators';

const scope = {
  payload: {
    priority: 'critical',
    count: 3,
    tags: ['urgent', 'billing'],
    title: 'Printer on fire',
    dueDate: '2030-01-01T00:00:00.000Z',
    created: '2020-01-01T00:00:00.000Z',
    enabled: true,
    disabled: false,
    empty: '',
    nested: { deep: { value: 42 } },
  },
  vars: { env: 'test' },
  outputs: {},
};

const run = (spec: Partial<ConditionSpec>): boolean =>
  evaluateCondition({ leftPath: 'payload.priority', operator: 'equals', right: '', ...spec } as ConditionSpec, scope);

describe('condition operators', () => {
  it('exposes exactly the 14 planned operators', () => {
    expect(Object.keys(OPERATORS).sort()).toEqual(
      [
        'contains',
        'date_after',
        'date_before',
        'ends_with',
        'equals',
        'gt',
        'is_empty',
        'is_false',
        'is_not_empty',
        'is_true',
        'lt',
        'not_contains',
        'not_equals',
        'starts_with',
      ].sort()
    );
  });

  it('equals / not_equals (primitive-tolerant: template right values arrive as strings)', () => {
    expect(run({ leftPath: 'payload.priority', operator: 'equals', right: 'critical' })).toBe(true);
    expect(run({ leftPath: 'payload.priority', operator: 'equals', right: 'low' })).toBe(false);
    // numeric left vs stringified right
    expect(run({ leftPath: 'payload.count', operator: 'equals', right: '3' })).toBe(true);
    expect(run({ leftPath: 'payload.count', operator: 'not_equals', right: '3' })).toBe(false);
    expect(run({ leftPath: 'payload.priority', operator: 'not_equals', right: 'low' })).toBe(true);
  });

  it('gt / lt compare numerically (and fail when not coercible)', () => {
    expect(run({ leftPath: 'payload.count', operator: 'gt', right: '2' })).toBe(true);
    expect(run({ leftPath: 'payload.count', operator: 'gt', right: '3' })).toBe(false);
    expect(run({ leftPath: 'payload.count', operator: 'lt', right: '10' })).toBe(true);
    expect(run({ leftPath: 'payload.priority', operator: 'gt', right: 'critical' })).toBe(false);
  });

  it('contains / not_contains work on strings and arrays', () => {
    expect(run({ leftPath: 'payload.title', operator: 'contains', right: 'fire' })).toBe(true);
    expect(run({ leftPath: 'payload.title', operator: 'contains', right: 'flood' })).toBe(false);
    expect(run({ leftPath: 'payload.tags', operator: 'contains', right: 'billing' })).toBe(true);
    expect(run({ leftPath: 'payload.tags', operator: 'not_contains', right: 'billing' })).toBe(false);
  });

  it('starts_with / ends_with', () => {
    expect(run({ leftPath: 'payload.title', operator: 'starts_with', right: 'Printer' })).toBe(true);
    expect(run({ leftPath: 'payload.title', operator: 'starts_with', right: 'fire' })).toBe(false);
    expect(run({ leftPath: 'payload.title', operator: 'ends_with', right: 'fire' })).toBe(true);
    expect(run({ leftPath: 'payload.title', operator: 'ends_with', right: 'Printer' })).toBe(false);
  });

  it('is_empty / is_not_empty cover null, empty string, empty arrays', () => {
    expect(run({ leftPath: 'payload.empty', operator: 'is_empty' })).toBe(true);
    expect(run({ leftPath: 'payload.missing', operator: 'is_empty' })).toBe(true);
    expect(run({ leftPath: 'payload.priority', operator: 'is_empty' })).toBe(false);
    expect(run({ leftPath: 'payload.priority', operator: 'is_not_empty' })).toBe(true);
  });

  it('date_before / date_after compare as dates and fail on invalid dates', () => {
    expect(run({ leftPath: 'payload.created', operator: 'date_before', right: '2030-06-01T00:00:00.000Z' })).toBe(true);
    expect(run({ leftPath: 'payload.dueDate', operator: 'date_after', right: '2029-01-01T00:00:00.000Z' })).toBe(true);
    expect(run({ leftPath: 'payload.dueDate', operator: 'date_before', right: 'not-a-date' })).toBe(false);
    expect(run({ leftPath: 'payload.title', operator: 'date_after', right: '2020-01-01' })).toBe(false);
  });

  it('is_true / is_false accept booleans and their string forms', () => {
    expect(run({ leftPath: 'payload.enabled', operator: 'is_true' })).toBe(true);
    expect(run({ leftPath: 'payload.enabled', operator: 'is_false' })).toBe(false);
    expect(run({ leftPath: 'payload.disabled', operator: 'is_false' })).toBe(true);
    expect(run({ leftPath: 'payload.disabled', operator: 'is_true' })).toBe(false);
    expect(evaluateCondition({ leftPath: 'vars.enabled', operator: 'is_true' }, { vars: { enabled: 'true' } })).toBe(true);
  });

  it('resolves leftPath via dot path (including arrays and deep nesting)', () => {
    expect(run({ leftPath: 'payload.nested.deep.value', operator: 'equals', right: '42' })).toBe(true);
    expect(run({ leftPath: 'payload.tags.0', operator: 'equals', right: 'urgent' })).toBe(true);
    expect(run({ leftPath: 'vars.env', operator: 'equals', right: 'test' })).toBe(true);
  });

  it('resolves {{...}} templates in the right value', () => {
    expect(
      evaluateCondition(
        { leftPath: 'payload.priority', operator: 'equals', right: '{{vars.expected}}' },
        { ...scope, vars: { expected: 'critical' } }
      )
    ).toBe(true);
  });

  it('throws UNKNOWN_OPERATOR for an unregistered operator', () => {
    expect(() => run({ operator: 'regex_match' })).toThrowError(/UNKNOWN_OPERATOR/);
  });

  it('getOperator returns undefined for unknown names', () => {
    expect(getOperator('nope')).toBeUndefined();
    expect(typeof getOperator('equals')).toBe('function');
  });
});

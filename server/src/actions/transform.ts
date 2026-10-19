import { registerAction, type ActionHandler } from './registry';

/**
 * action.transform — emits a static (template-resolved) object as `data`.
 * Templates in mapping values were already resolved by the engine, so
 * `mappings: { ref: '{{outputs.a1.reference}}' }` arrives concrete.
 */
const transformAction: ActionHandler = async (config) => {
  const mappings = config.mappings;
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    throw Object.assign(new Error('transform requires a "mappings" object'), { code: 'TRANSFORM_CONFIG' });
  }
  return { output: { data: mappings as Record<string, unknown> } };
};

export function registerTransformAction(): void {
  registerAction('action.transform', transformAction);
}

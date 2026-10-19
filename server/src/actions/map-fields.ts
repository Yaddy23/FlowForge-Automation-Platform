import { registerAction, type ActionHandler } from './registry';
import { getPath, type TemplateScope } from '../workflow-engine/template';

/**
 * action.map-fields — projects source dot-paths (relative to `inputPath`,
 * default the trigger payload) onto new output keys. The output IS the
 * projected object, so downstream templates read `outputs.<id>.<key>` directly.
 */
const mapFieldsAction: ActionHandler = async (config, ctx) => {
  const mapping = config.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw Object.assign(new Error('map-fields requires a "mapping" object'), { code: 'MAPFIELDS_CONFIG' });
  }
  const inputPath = typeof config.inputPath === 'string' && config.inputPath ? config.inputPath : 'payload';
  const scope: TemplateScope = { payload: ctx.payload, vars: ctx.vars, outputs: ctx.nodeOutputs };
  const source = getPath(scope, inputPath) ?? {};

  const out: Record<string, unknown> = {};
  for (const [key, srcPath] of Object.entries(mapping as Record<string, unknown>)) {
    out[key] = typeof srcPath === 'string' ? getPath(source, srcPath) : undefined;
  }
  return { output: out };
};

export function registerMapFieldsAction(): void {
  registerAction('action.map-fields', mapFieldsAction);
}

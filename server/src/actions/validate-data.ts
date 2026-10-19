import Ajv from 'ajv';
import { registerAction, type ActionHandler } from './registry';
import { getPath, type TemplateScope } from '../workflow-engine/template';

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * action.validate — checks data against a JSON Schema via AJV. Never throws
 * on invalid data: validation failure is a *result* ({valid: false, errors}),
 * so workflows can branch on it; only a malformed schema config throws.
 * Defaults to validating the trigger payload when no `data`/`inputPath` given.
 */
const validateAction: ActionHandler = async (config, ctx) => {
  const schema = config.schema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw Object.assign(new Error('validate requires a JSON "schema" object'), { code: 'VALIDATE_CONFIG' });
  }

  let data = config.data;
  if (data === undefined && typeof config.inputPath === 'string' && config.inputPath) {
    const scope: TemplateScope = { payload: ctx.payload, vars: ctx.vars, outputs: ctx.nodeOutputs };
    data = getPath(scope, config.inputPath);
  }

  const validate = ajv.compile(schema as object);
  const valid = validate(data);
  return {
    output: {
      valid,
      errors: valid ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`.trim()),
    },
  };
};

export function registerValidateAction(): void {
  registerAction('action.validate', validateAction);
}

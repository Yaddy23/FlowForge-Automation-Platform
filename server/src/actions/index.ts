import { registerBuiltInActions } from './log';
import { registerEmailAction } from './email';
import { registerNotifyAction } from './notify';
import { registerWebhookOutAction } from './webhook-out';
import { registerTransformAction } from './transform';
import { registerFilterAction } from './filter';
import { registerValidateAction } from './validate-data';
import { registerMapFieldsAction } from './map-fields';
import { registerDelayAction } from './delay';
import { registerFormatDateAction } from './format-date';
import { registerGenerateReferenceAction } from './generate-reference';
import { registerRecordActions } from './record';
import { registerCsvAction } from './csv';
import { registerReportAction } from './report';

/**
 * Registers every built-in action handler (Task 10 library). Idempotent —
 * registration is a Map.set, safe to call from the engine module and tests.
 */
export function registerAllActions(): void {
  registerBuiltInActions();
  registerEmailAction();
  registerNotifyAction();
  registerWebhookOutAction();
  registerTransformAction();
  registerFilterAction();
  registerValidateAction();
  registerMapFieldsAction();
  registerDelayAction();
  registerFormatDateAction();
  registerGenerateReferenceAction();
  registerRecordActions();
  registerCsvAction();
  registerReportAction();
}

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { registerAction, type ActionHandler } from './registry';
import { ActionError } from './errors';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * action.format-date — dayjs rendering with an optional format and IANA
 * timezone (utc + timezone plugins). Unparseable input is a config error
 * (INVALID_DATE), not a silent 'Invalid Date' in outputs.
 */
const formatDateAction: ActionHandler = async (config) => {
  const raw = config.value;
  const value = raw instanceof Date ? raw.toISOString() : String(raw ?? '');
  const d = dayjs(value);
  if (!d.isValid()) {
    throw new ActionError('INVALID_DATE', `unparseable date value "${value}"`);
  }
  const format = typeof config.format === 'string' && config.format ? config.format : 'YYYY-MM-DD HH:mm:ss';
  const timezoneName = typeof config.timezone === 'string' && config.timezone ? config.timezone : undefined;
  const formatted = timezoneName ? d.tz(timezoneName).format(format) : d.format(format);
  return { output: { formatted, iso: d.toISOString() } };
};

export function registerFormatDateAction(): void {
  registerAction('action.format-date', formatDateAction);
}

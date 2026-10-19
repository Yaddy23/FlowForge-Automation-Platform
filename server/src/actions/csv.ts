import { registerAction, type ActionHandler } from './registry';
import { getPath, type TemplateScope } from '../workflow-engine/template';
import { ActionError } from './errors';

/** Escapes a CSV field: quotes wrap fields containing comma/quote/newline. */
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * action.csv — parse a CSV string into row objects, or generate a CSV string
 * from an array (dot-path into the run scope). Minimal, dependency-free
 * parsing: header row + comma/quote handling; good enough for tabular
 * exports produced by this platform (Task 13's CSV-validation template).
 */
const csvAction: ActionHandler = async (config, ctx) => {
  const operation = String(config.operation ?? '');
  const scope: TemplateScope = { payload: ctx.payload, vars: ctx.vars, outputs: ctx.nodeOutputs };

  if (operation === 'parse') {
    const text = typeof config.data === 'string' ? config.data : String(config.data ?? '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) return { output: { rows: [] } };
    const headers = lines[0].split(',').map((h) => h.trim());
    const rows: Record<string, string>[] = [];
    for (const line of lines.slice(1)) {
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            current += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          cells.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = (cells[idx] ?? '').trim();
      });
      rows.push(row);
    }
    return { output: { rows } };
  }

  if (operation === 'generate') {
    const inputPath = String(config.inputPath ?? '');
    const items = getPath(scope, inputPath);
    if (!Array.isArray(items) || items.length === 0) {
      throw new ActionError('CSV_INPUT', `"${inputPath}" did not resolve to a non-empty array`);
    }
    const headers = [...new Set(items.flatMap((item) => (item && typeof item === 'object' ? Object.keys(item) : [])))];
    const lines = [headers.join(',')];
    for (const item of items) {
      const row: Record<string, unknown> =
        item && typeof item === 'object' ? (item as Record<string, unknown>) : { value: item };
      lines.push(headers.map((h) => csvField(row[h])).join(','));
    }
    return { output: { csv: lines.join('\n') } };
  }

  throw new ActionError('CSV_OPERATION', `unknown csv operation "${operation}"`);
};

export function registerCsvAction(): void {
  registerAction('action.csv', csvAction);
}

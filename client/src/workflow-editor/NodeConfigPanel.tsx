import { Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { getKindMeta } from './registry';
import type { FlowNodeData } from './useWorkflowEditor';

interface NodeConfigPanelProps {
  node: {
    id: string;
    data: unknown;
  } | null;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  onLabelChange: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}

/** Per-kind config form, rendered from the client registry's field specs. */
export function NodeConfigPanel({ node, onConfigChange, onLabelChange, onDelete }: NodeConfigPanelProps) {
  if (!node) {
    return (
      <aside
        className="flex w-72 shrink-0 flex-col border-l border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        aria-label="Node configuration"
      >
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Configuration</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Select a node to edit its configuration.</p>
      </aside>
    );
  }

  const data = node.data as FlowNodeData;
  const meta = getKindMeta(data.kind);

  const setField = (key: string, value: unknown) => {
    onConfigChange(node.id, { ...data.config, [key]: value });
  };

  return (
    <aside
      className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Node configuration"
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Configuration</h2>
      <p className="mb-4 text-sm font-semibold">{meta?.label ?? data.kind}</p>

      <label className="mb-3 block text-sm">
        <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Label</span>
        <Input value={String(data.label ?? '')} onChange={(e) => onLabelChange(node.id, e.target.value)} />
      </label>

      {meta?.fields.map((field) => (
        <label key={field.key} className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </span>
          {field.type === 'textarea' ? (
            <Textarea
              aria-label={field.label}
              rows={4}
              placeholder={field.placeholder}
              value={String(data.config[field.key] ?? '')}
              onChange={(e) => setField(field.key, e.target.value)}
            />
          ) : field.type === 'select' ? (
            <Select
              aria-label={field.label}
              options={[{ value: '', label: '— none —' }, ...(field.options ?? [])]}
              value={String(data.config[field.key] ?? '')}
              onChange={(e) => setField(field.key, e.target.value)}
            />
          ) : (
            <Input
              aria-label={field.label}
              type={field.type === 'number' ? 'number' : 'text'}
              placeholder={field.placeholder}
              value={String(data.config[field.key] ?? '')}
              onChange={(e) => setField(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
            />
          )}
        </label>
      ))}

      {(!meta || meta.fields.length === 0) && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">This node has no configuration options.</p>
      )}

      <Button variant="destructive" size="sm" className="mt-auto" onClick={() => onDelete(node.id)}>
        <Trash2 className="h-4 w-4" aria-hidden />
        Delete node
      </Button>
    </aside>
  );
}

export default NodeConfigPanel;

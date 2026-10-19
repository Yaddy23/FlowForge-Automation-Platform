import { cn } from '../lib/cn';
import { NODE_KINDS, type NodeCategory } from './registry';

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: 'Triggers',
  logic: 'Logic',
  condition: 'Conditions',
  action: 'Actions',
};

interface NodePaletteProps {
  onAdd: (kind: string) => void;
}

/**
 * Node palette, grouped by category. Items are click-to-add (keyboard and
 * test friendly) and draggable onto the canvas.
 */
export function NodePalette({ onAdd }: NodePaletteProps) {
  const groups = Object.keys(CATEGORY_LABELS) as NodeCategory[];

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900" aria-label="Node palette">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Palette</h2>
      {groups.map((group) => (
        <div key={group} className="mb-3">
          <p className="mb-1 text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500">{CATEGORY_LABELS[group]}</p>
          <div className="space-y-1">
            {NODE_KINDS.filter((m) => m.category === group).map((meta) => (
              <button
                key={meta.kind}
                type="button"
                title={meta.description}
                aria-label={meta.label}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/flowforge-kind', meta.kind);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onAdd(meta.kind)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800',
                )}
              >
                <meta.icon className={cn('h-4 w-4 shrink-0')} aria-hidden />
                <span className="truncate">{meta.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}

export default NodePalette;

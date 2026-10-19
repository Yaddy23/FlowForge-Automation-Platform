import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../lib/cn';
import { CATEGORY_STYLES, getKindMeta } from '../registry';
import type { FlowNodeData } from '../useWorkflowEditor';

interface FlowNodeProps extends NodeProps {
  onHandleClick?: (nodeId: string, handleType: 'source' | 'target') => void;
  onTestClick?: (nodeId: string) => void;
}

/**
 * Single styled node component used for every kind — category drives the
 * palette styling. Triggers get only a source handle (no incoming edges);
 * everything else gets both.
 */
export default function FlowNode({ data, selected }: FlowNodeProps) {
  const flowData = data as unknown as FlowNodeData;
  const meta = getKindMeta(flowData.kind);
  const category = meta?.category ?? 'action';
  const Icon = meta?.icon;
  const isTrigger = category === 'trigger';
  const testId = `rf-node-${flowData.kind.replace(/[._]/g, '-')}`;

  return (
    <div
      data-testid={testId}
      className={cn(
        'w-48 rounded-xl border-2 bg-white px-3 py-2 shadow-md dark:bg-zinc-900',
        CATEGORY_STYLES[category].node,
        selected && 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950',
        selected && CATEGORY_STYLES[category].ring,
      )}
    >
      {!isTrigger && (
        <Handle
          id="in"
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !bg-zinc-300 dark:!bg-zinc-600"
          data-testid={`handle-tgt-${flowData.kind.replace(/[._]/g, '-')}`}
        />
      )}
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden /> : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{String(flowData.label ?? meta?.label ?? flowData.kind)}</p>
          <p className={cn('text-[10px] uppercase tracking-wide', CATEGORY_STYLES[category].badge, 'rounded px-1')}>{category}</p>
        </div>
      </div>
      <Handle
        id="out"
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !bg-zinc-300 dark:!bg-zinc-600"
        data-testid={`handle-src-${flowData.kind.replace(/[._]/g, '-')}`}
      />
    </div>
  );
}

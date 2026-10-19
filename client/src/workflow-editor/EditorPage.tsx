import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Redo2, Save, Undo2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import '@xyflow/react/dist/style.css';
import { apiGet, apiPost } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../components/ui/toast';
import { NodePalette } from './NodePalette';
import { NodeConfigPanel } from './NodeConfigPanel';
import FlowNode from './nodes/FlowNode';
import { useWorkflowEditor } from './useWorkflowEditor';
import { validateDefinitionClient } from './validation';

const nodeTypes: NodeTypes = { flow: FlowNode };

interface WorkflowResponse {
  workflow: { _id: string; name: string; description?: string; status: string; latestVersion: number };
}
interface VersionsResponse {
  data: { version: number; definition?: unknown }[];
}

function EditorPageInner() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { toast } = useToast();
  const editor = useWorkflowEditor();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // Load an existing workflow + its latest definition.
  const { data: workflowData } = useQuery({
    queryKey: ['workflow', id],
    enabled: !isNew,
    queryFn: () => apiGet<WorkflowResponse>(`/workflows/${id}`),
  });
  const { data: versionsData } = useQuery({
    queryKey: ['workflow-versions', id],
    enabled: !isNew,
    queryFn: () => apiGet<VersionsResponse>(`/workflows/${id}/versions`),
  });

  useEffect(() => {
    if (isNew || loadedRef.current) return;
    if (workflowData?.workflow) setName(workflowData.workflow.name);
  }, [isNew, workflowData]);

  useEffect(() => {
    if (isNew || loadedRef.current) return;
    const versions = versionsData?.data;
    if (versions && versions.length > 0) {
      const latest = versions[0]; // API returns newest first
      if (latest.definition) {
        editor.loadDefinition(latest.definition as never);
        loadedRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, versionsData]);

  // Click-to-connect: clicking a source handle then a target handle creates an
  // edge (drag-and-drop between handles also works via React Flow onConnect).
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-testid^="handle-"]');
      if (!el) return;
      const testId = el.dataset.testid ?? '';
      const node = editor.nodes.find((n) => {
        const kind = String((n.data as Record<string, unknown>).kind);
        return testId === `handle-src-${kind.replace(/[._]/g, '-')}` || testId === `handle-tgt-${kind.replace(/[._]/g, '-')}`;
      });
      if (!node) return;
      if (testId.startsWith('handle-src-')) {
        setPendingSource(node.id);
      } else if (pendingSource && pendingSource !== node.id) {
        editor.onConnect({ source: pendingSource, target: node.id, sourceHandle: 'out', targetHandle: 'in' });
        setPendingSource(null);
      }
    },
    [editor, pendingSource],
  );

  const handleSave = async () => {
    const definition = editor.toDefinition();
    const issues = validateDefinitionClient(definition);
    if (issues.length > 0) {
      toast('error', `Cannot save: ${issues.slice(0, 3).map((i) => i.message).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`);
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const res = await apiPost<{ workflow: { _id: string }; warnings?: unknown[] }>('/workflows', {
          name: name.trim() || 'Untitled workflow',
          definition,
        });
        toast('success', `Workflow created (v1).`);
        void res;
        navigate(`/workflows/builder/${res.workflow._id}`, { replace: true });
      } else {
        const res = await apiPost<{ version: { version: number }; warnings?: { message: string }[] }>(
          `/workflows/${id}/versions`,
          { definition },
        );
        const warnings = res.warnings ?? [];
        if (warnings.length > 0) {
          toast('success', `Version ${res.version.version} saved with ${warnings.length} warning(s): ${warnings[0].message}`);
        } else {
          toast('success', `Version ${res.version.version} saved.`);
        }
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem-3rem)] min-h-[480px] flex-col">
      {/* Editor toolbar */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <Link to="/workflows" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back to workflows">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        {isNew ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name"
            aria-label="Workflow name"
            className="w-64"
          />
        ) : (
          <span className="text-sm font-semibold">{name || 'Workflow'}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={editor.undo} disabled={!editor.canUndo} aria-label="Undo">
            <Undo2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" onClick={editor.redo} disabled={!editor.canRedo} aria-label="Redo">
            <Redo2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" aria-hidden />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex min-h-0 flex-1">
        <NodePalette onAdd={editor.addNode} />
        <div className="relative min-w-0 flex-1" onClick={onCanvasClick}>
          <ReactFlow
            nodes={editor.nodes}
            edges={editor.edges}
            nodeTypes={nodeTypes}
            onNodesChange={editor.onNodesChange}
            onEdgesChange={editor.onEdgesChange}
            onConnect={editor.onConnect}
            onNodeClick={(_, node: Node) => editor.selectNode(node.id)}
            onPaneClick={() => editor.selectNode(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
          </ReactFlow>
          {pendingSource && (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs text-white">
              Click a target node to connect
            </div>
          )}
        </div>
        <NodeConfigPanel
          node={editor.selectedNode}
          onConfigChange={editor.updateNodeConfig}
          onLabelChange={editor.updateNodeLabel}
          onDelete={editor.deleteNode}
        />
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <ReactFlowProvider>
      <EditorPageInner />
    </ReactFlowProvider>
  );
}

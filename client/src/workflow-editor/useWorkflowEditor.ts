import { useCallback, useRef, useState } from 'react';
import {
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import type { NodeKind, WorkflowDefinition } from 'shared/types/workflow';
import { getKindMeta } from './registry';

export interface FlowNodeData extends Record<string, unknown> {
  kind: string;
  label: string;
  config: Record<string, unknown>;
}

let nodeCounter = 0;
function nextNodeId(kind: string): string {
  nodeCounter += 1;
  return `${kind}-${Date.now()}-${nodeCounter}`;
}

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

export interface WorkflowEditorState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedNode: Node | null;
  canUndo: boolean;
  canRedo: boolean;
  addNode: (kind: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  deleteNode: (id: string) => void;
  undo: () => void;
  redo: () => void;
  loadDefinition: (def: WorkflowDefinition) => void;
  toDefinition: () => WorkflowDefinition;
}

/**
 * Canvas state + history stack for the visual editor. Undo/redo snapshots the
 * whole { nodes, edges } pair; connection rules reject edges into triggers.
 */
export function useWorkflowEditor(): WorkflowEditorState {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [historyTick, setHistoryTick] = useState(0); // re-render on stack changes

  const pushHistory = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-49), { nodes, edges }];
    redoStack.current = [];
    setHistoryTick((t) => t + 1);
  }, [nodes, edges]);

  const addNode = useCallback(
    (kind: string) => {
      pushHistory();
      const meta = getKindMeta(kind);
      const id = nextNodeId(kind);
      const node: Node = {
        id,
        type: 'flow',
        position: { x: 80 + (nodes.length % 4) * 60, y: 60 + nodes.length * 40 },
        data: { kind, label: meta?.label ?? kind, config: {} } satisfies FlowNodeData,
      };
      setNodes((prev) => [...prev, node]);
      setSelectedNodeId(id);
    },
    [nodes.length, pushHistory],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Rule: triggers cannot receive incoming edges.
      const target = nodes.find((n) => n.id === connection.target);
      if (target && getKindMeta(String(target.data.kind))?.category === 'trigger') return;
      if (connection.source === connection.target) return;
      pushHistory();
      setEdges((prev) => addEdge({ ...connection, id: `edge-${Date.now()}-${prev.length}` }, prev));
    },
    [nodes, pushHistory],
  );

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const updateNodeConfig = useCallback(
    (id: string, config: Record<string, unknown>) => {
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n)));
    },
    [],
  );

  const updateNodeLabel = useCallback((id: string, label: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
  }, []);

  const deleteNode = useCallback(
    (id: string) => {
      pushHistory();
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
      setSelectedNodeId((cur) => (cur === id ? null : cur));
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push({ nodes, edges });
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setHistoryTick((t) => t + 1);
  }, [nodes, edges]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push({ nodes, edges });
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setHistoryTick((t) => t + 1);
  }, [nodes, edges]);

  const loadDefinition = useCallback((def: WorkflowDefinition) => {
    const loadedNodes: Node[] = def.nodes.map((n, i) => ({
      id: n.id,
      type: 'flow',
      position: { x: 80 + (i % 3) * 220, y: 60 + Math.floor(i / 3) * 120 },
      data: { kind: n.type, label: getKindMeta(n.type)?.label ?? n.type, config: n.config } satisfies FlowNodeData,
    }));
    const loadedEdges: Edge[] = def.edges.map((e, i) => ({
      id: e.id || `edge-loaded-${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? 'out',
    }));
    undoStack.current = [];
    redoStack.current = [];
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setHistoryTick((t) => t + 1);
  }, []);

  const toDefinition = useCallback((): WorkflowDefinition => {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: String((n.data as FlowNodeData).kind) as NodeKind,
        config: ((n.data as FlowNodeData).config ?? {}) as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
      })),
    };
  }, [nodes, edges]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return {
    nodes,
    edges,
    selectedNodeId,
    selectedNode,
    canUndo: undoStack.current.length > 0 && historyTick >= 0,
    canRedo: redoStack.current.length > 0 && historyTick >= 0,
    addNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    updateNodeConfig,
    updateNodeLabel,
    deleteNode,
    undo,
    redo,
    loadDefinition,
    toDefinition,
  };
}

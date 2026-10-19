import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RotateCcw, XCircle } from 'lucide-react';
import { apiGet, apiPost, apiDownload, ApiError } from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useToast } from '../components/ui/toast';
import { EmptyState } from '../components/EmptyState';
import { RUN_STATUS_VARIANT } from './ExecutionsListPage';

interface RunDetail {
  _id: string;
  workflow?: { _id: string; name?: string };
  workflowVersion: number;
  status: string;
  trigger: { type: string; payload: unknown };
  error?: { code: string; message: string } | null;
  createdBy?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface NodeRunRow {
  _id: string;
  nodeId: string;
  kind: string;
  status: string;
  inputSummary?: string;
  outputSummary?: string;
  error?: { code: string; message: string } | null;
  startedAt?: string;
  finishedAt?: string;
  attempts: number;
}

interface RunResponse {
  run: RunDetail;
  nodeRuns: NodeRunRow[];
}

const NODE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'default'> = {
  succeeded: 'success',
  running: 'warning',
  failed: 'danger',
  skipped: 'neutral',
};

function nodeDuration(node: NodeRunRow): string {
  if (!node.startedAt || !node.finishedAt) return '—';
  const ms = Math.max(0, new Date(node.finishedAt).getTime() - new Date(node.startedAt).getTime());
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPayload, setShowPayload] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['run', id],
    queryFn: () => apiGet<RunResponse>(`/runs/${id}`),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['run', id] });
    queryClient.invalidateQueries({ queryKey: ['runs'] });
  };

  const retryMutation = useMutation({
    mutationFn: () => apiPost<{ run: RunDetail }>(`/runs/${id}/retry`),
    onSuccess: () => {
      toast('success', 'Run re-queued for execution.');
      invalidate();
    },
    onError: (err: Error) => toast('error', err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiPost<{ run: RunDetail }>(`/runs/${id}/cancel`),
    onSuccess: () => {
      toast('success', 'Run cancelled.');
      invalidate();
    },
    onError: (err: Error) => toast('error', err.message),
  });

  const downloadLogs = async () => {
    try {
      const blob = await apiDownload(`/runs/${id}/logs`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-${id}.ndjson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Log download failed');
    }
  };

  if (isLoading) {
    return <p role="status" className="text-sm text-zinc-500">Loading execution…</p>;
  }
  if (isError || !data) {
    return <EmptyState icon={XCircle} title="Execution not found" description="It may have been removed." />;
  }

  const { run, nodeRuns } = data;
  const actionable = run.status === 'failed' || run.status === 'timed_out';
  const cancellable = run.status === 'queued' || run.status === 'running' || run.status === 'waiting';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            {run.workflow?.name ?? 'Execution'}
            <Badge variant={RUN_STATUS_VARIANT[run.status] ?? 'neutral'}>{run.status}</Badge>
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {run.trigger?.type} trigger · v{run.workflowVersion} · started{' '}
            {run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}
            {run.finishedAt ? ` · finished ${new Date(run.finishedAt).toLocaleString()}` : ''}
          </p>
          {run.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {run.error.code}: {run.error.message}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {actionable && (
            <Button size="sm" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Retry
            </Button>
          )}
          {cancellable && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="h-4 w-4" aria-hidden />
              Cancel
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={downloadLogs}>
            <Download className="h-4 w-4" aria-hidden />
            Logs
          </Button>
        </div>
      </div>

      <section className="mb-6">
        <button
          type="button"
          className="mb-2 text-sm font-semibold text-zinc-700 hover:underline dark:text-zinc-300"
          onClick={() => setShowPayload((v) => !v)}
        >
          {showPayload ? '▾' : '▸'} Trigger payload
        </button>
        {showPayload && (
          <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
            {JSON.stringify(run.trigger?.payload ?? {}, null, 2)}
          </pre>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Node timeline</h2>
        {nodeRuns.length === 0 ? (
          <p className="text-sm text-zinc-500">No nodes have executed yet.</p>
        ) : (
          <ol className="space-y-3">
            {nodeRuns.map((node) => (
              <li
                key={node._id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={NODE_STATUS_VARIANT[node.status] ?? 'neutral'}>{node.status}</Badge>
                  <span className="font-mono text-sm font-medium">{node.nodeId}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{node.kind}</span>
                  <span className="text-xs text-zinc-400">attempt {node.attempts}</span>
                  <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">{nodeDuration(node)}</span>
                </div>
                {node.error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {node.error.code}: {node.error.message}
                  </p>
                )}
                {node.inputSummary && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-zinc-500">Input</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                      {node.inputSummary}
                    </pre>
                  </details>
                )}
                {node.outputSummary && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-zinc-500">Output</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                      {node.outputSummary}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {run.workflow?._id && (
        <p className="mt-6 text-sm">
          <Link
            to={`/workflows/${run.workflow._id}/executions`}
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            All executions of this workflow →
          </Link>
        </p>
      )}
    </div>
  );
}

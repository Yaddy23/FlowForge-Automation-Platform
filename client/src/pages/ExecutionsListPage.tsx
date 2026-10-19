import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlayCircle } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { EmptyState } from '../components/EmptyState';

interface RunRow {
  _id: string;
  workflow?: { _id: string; name?: string };
  workflowVersion: number;
  status: string;
  trigger: { type: string };
  error?: { code: string; message: string } | null;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface ListResponse {
  data: RunRow[];
  page: number;
  total: number;
}

export const RUN_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'default'> = {
  succeeded: 'success',
  failed: 'danger',
  timed_out: 'danger',
  cancelled: 'neutral',
  running: 'warning',
  waiting: 'warning',
  queued: 'default',
};

function duration(run: RunRow): string {
  if (!run.startedAt) return '—';
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  const ms = Math.max(0, end - new Date(run.startedAt).getTime());
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function ExecutionsListPage() {
  // /workflows/:id/executions arrives pre-filtered to one workflow.
  const { id: routeWorkflowId } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [workflowId, setWorkflowId] = useState(routeWorkflowId ?? '');
  const [from, setFrom] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) params.set('status', status);
    if (workflowId) params.set('workflowId', workflowId);
    if (from) params.set('from', new Date(from).toISOString());
    return params.toString();
  }, [page, status, workflowId, from]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['runs', query],
    queryFn: () => apiGet<ListResponse>(`/runs?${query}`),
  });

  const workflowsQuery = useQuery({
    queryKey: ['workflows', 1],
    queryFn: () => apiGet<{ data: Array<{ _id: string; name: string }> }>('/workflows?limit=100'),
  });

  const runs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Executions</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Every run across all workflows, newest first.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <Select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            aria-label="Filter by status"
            options={[
              { value: '', label: 'All' },
              ...['queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'timed_out'].map((s) => ({
                value: s,
                label: s,
              })),
            ]}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Workflow</span>
          <Select
            value={workflowId}
            onChange={(e) => {
              setPage(1);
              setWorkflowId(e.target.value);
            }}
            aria-label="Filter by workflow"
            options={[
              { value: '', label: 'All' },
              ...(workflowsQuery.data?.data ?? []).map((wf) => ({ value: wf._id, label: wf.name })),
            ]}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">From</span>
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
            aria-label="Filter from date"
          />
        </label>
      </div>

      {isLoading ? (
        <p role="status" className="text-sm text-zinc-500">Loading executions…</p>
      ) : isError ? (
        <EmptyState icon={PlayCircle} title="Failed to load executions" description="Check your connection and try again." />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={PlayCircle}
          title="No executions yet"
          description="Activate a workflow and run it to see execution history here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run._id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/executions/${run._id}`}
                      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {run.workflow?.name ?? 'Unknown workflow'}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-400">v{run.workflowVersion}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={RUN_STATUS_VARIANT[run.status] ?? 'neutral'}>{run.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{run.trigger?.type}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {new Date(run.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{duration(run)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

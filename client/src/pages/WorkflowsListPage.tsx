import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus, Workflow as WorkflowIcon } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { useToast } from '../components/ui/toast';
import { EmptyState } from '../components/EmptyState';

interface WorkflowRow {
  _id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  latestVersion: number;
  activeVersion?: number | null;
  owner?: { _id: string; name: string; email: string };
  updatedAt: string;
}

interface ListResponse {
  data: WorkflowRow[];
  total: number;
}

const STATUS_VARIANT: Record<WorkflowRow['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  draft: 'warning',
  archived: 'neutral',
};

export default function WorkflowsListPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflows', page],
    queryFn: () => apiGet<ListResponse>(`/workflows?page=${page}&limit=20`),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description?: string }) => apiPost<{ workflow: WorkflowRow }>('/workflows', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      toast('success', 'Workflow created. Open it in the builder to add nodes.');
    },
    onError: (err: Error) => {
      toast('error', err.message);
    },
  });

  const workflows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New Workflow
        </Button>
      </div>

      {isLoading ? (
        <p role="status" className="text-sm text-zinc-500">Loading workflows…</p>
      ) : isError ? (
        <EmptyState icon={WorkflowIcon} title="Failed to load workflows" description="Check your connection and try again." />
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No workflows yet"
          description="Create your first workflow from scratch, or start from a template."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Versions</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr key={wf._id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/workflows/builder/${wf._id}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                      {wf.name}
                    </Link>
                    {wf.description && <p className="text-xs text-zinc-500 dark:text-zinc-400">{wf.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[wf.status]}>{wf.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{wf.owner?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    v{wf.latestVersion}
                    {wf.activeVersion ? <span className="text-xs text-emerald-600 dark:text-emerald-400"> (active v{wf.activeVersion})</span> : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{new Date(wf.updatedAt).toLocaleDateString()}</td>
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

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create workflow">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createMutation.mutate({ name: newName.trim(), description: newDescription.trim() || undefined });
          }}
          className="space-y-4"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus aria-label="Workflow name" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Description</span>
            <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} aria-label="Workflow description" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

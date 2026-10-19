import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from '../App';
import { AuthProvider } from '../lib/auth-context';
import { ToastProvider } from '../components/ui/toast';
import { setAuthState } from '../lib/auth-storage';
import type { WorkflowDefinition } from 'shared/types/workflow';
import type { UserPublic } from 'shared/types/user';

vi.mock('../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

import { apiPost } from '../lib/api';

const builderUser: UserPublic = {
  id: 'u1',
  email: 'builder@flowforge.dev',
  name: 'Bob Builder',
  role: 'workflow_builder',
};

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/workflows/builder/new']}>
      <AuthProvider>
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <AppRoutes />
          </QueryClientProvider>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

vi.mocked(apiPost).mockResolvedValue({
  workflow: { _id: 'wf-123', name: 'My Flow', status: 'draft', latestVersion: 1 },
  version: { version: 1 },
  warnings: [],
});

describe('workflow editor', () => {
  beforeEach(() => {
    setAuthState({ accessToken: 'a', refreshToken: 'r', user: builderUser });
    vi.mocked(apiPost).mockClear();
  });

  it('adds a trigger and email node, connects them, fills config, and saves a new workflow', async () => {
    renderEditor();

    // Palette: add a manual trigger and an email action (click-to-add).
    await userEvent.click(screen.getByRole('button', { name: /manual trigger/i }));
    await userEvent.click(screen.getByRole('button', { name: /send email/i }));

    // Both nodes are on the canvas.
    expect(screen.getByTestId('rf-node-trigger-manual')).toBeInTheDocument();
    expect(screen.getByTestId('rf-node-action-email')).toBeInTheDocument();

    // Connect: click the trigger's source handle, then the email node's target handle.
    const sourceHandle = screen.getByTestId('handle-src-trigger-manual');
    const targetHandle = screen.getByTestId('handle-tgt-action-email');
    await userEvent.click(sourceHandle);
    await userEvent.click(targetHandle);

    // Fill the config panel for the selected email node.
    const emailNode = screen.getByTestId('rf-node-action-email');
    await userEvent.click(emailNode);
    await userEvent.type(screen.getByLabelText('To'), 'ops@flowforge.dev');
    await userEvent.type(screen.getByLabelText('Subject'), 'Ticket escalated');
    await userEvent.type(screen.getByLabelText('Body'), 'A critical ticket arrived.');

    // Save → POST /api/workflows with name + definition (2 nodes, 1 edge).
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost).toHaveBeenCalledWith(
      '/workflows',
      expect.objectContaining({
        name: expect.any(String),
        definition: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ type: 'trigger.manual' }),
            expect.objectContaining({ type: 'action.email', config: expect.objectContaining({ to: 'ops@flowforge.dev' }) }),
          ]),
          edges: expect.arrayContaining([
            expect.objectContaining({ source: expect.any(String), target: expect.any(String) }),
          ]),
        }),
      }),
    );

    const body = vi.mocked(apiPost).mock.calls[0][1] as { definition: WorkflowDefinition };
    const definition = body.definition;
    expect(definition.nodes).toHaveLength(2);
    expect(definition.edges).toHaveLength(1);
  });

  it('undoes a node addition', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: /manual trigger/i }));
    expect(screen.getByTestId('rf-node-trigger-manual')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.queryByTestId('rf-node-trigger-manual')).not.toBeInTheDocument();
  });
});

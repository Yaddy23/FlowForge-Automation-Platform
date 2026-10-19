import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from '../App';
import { AuthProvider } from '../lib/auth-context';
import { setAuthState } from '../lib/auth-storage';
import type { UserPublic } from 'shared/types/user';

function renderApp(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <AppRoutes />
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const adminUser: UserPublic = {
  id: 'u1',
  email: 'admin@flowforge.dev',
  name: 'Demo Admin',
  role: 'super_admin',
};

const viewerUser: UserPublic = {
  id: 'u2',
  email: 'viewer@flowforge.dev',
  name: 'Val Viewer',
  role: 'viewer',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('app shell', () => {
  it('renders login, and submitting demo credentials shows the user name in the user menu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/auth/login')) {
          return new Response(
            JSON.stringify({ accessToken: 'access-token', refreshToken: 'refresh-token', user: adminUser }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    renderApp(['/login']);

    expect(screen.getByRole('heading', { name: /flowforge/i })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@flowforge.dev');
    await userEvent.type(screen.getByLabelText(/password/i), 'Demo123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // After login the shell renders with the user menu showing the account name.
    expect(await screen.findByText('Demo Admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workflows' })).toBeInTheDocument();
  });

  it('does not render User Management for a viewer account', () => {
    setAuthState({ accessToken: 'a', refreshToken: 'r', user: viewerUser });

    renderApp(['/']);

    expect(screen.getByText('Val Viewer')).toBeInTheDocument();
    expect(screen.queryByText(/User Management/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Logs' })).toBeInTheDocument();
  });
});

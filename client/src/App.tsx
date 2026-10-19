import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Bell,
  CalendarClock,
  FileStack,
  GitBranch,
  KeyRound,
  PlayCircle,
  Plug,
  ScrollText,
  Settings,
  Users,
  BarChart3,
} from 'lucide-react';
import { AuthProvider } from './lib/auth-context';
import AppLayout from './components/layout/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PlaceholderPage from './pages/PlaceholderPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/**
 * Route tree. Exported separately from the default App so tests can mount it
 * inside their own MemoryRouter + providers.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workflows" element={<PlaceholderPage icon={GitBranch} title="Workflows" description="Your workflows will be listed here. Create one from scratch or start from a template." />} />
        <Route path="/workflows/builder/:id" element={<PlaceholderPage icon={GitBranch} title="Workflow Builder" description="The visual editor opens here. Task 7 brings the palette, canvas, and config panel." />} />
        <Route path="/workflows/:id/executions" element={<PlaceholderPage icon={PlayCircle} title="Workflow Executions" description="Execution history for this workflow will appear here." />} />
        <Route path="/executions" element={<PlaceholderPage icon={PlayCircle} title="Executions" description="All workflow executions, with filters and drill-down, land here." />} />
        <Route path="/executions/:id" element={<PlaceholderPage icon={PlayCircle} title="Execution Detail" description="Node timeline, inputs/outputs, and logs for a single execution." />} />
        <Route path="/templates" element={<PlaceholderPage icon={FileStack} title="Templates" description="Ready-made workflow templates you can instantiate and customize." />} />
        <Route path="/scheduled" element={<PlaceholderPage icon={CalendarClock} title="Scheduled Runs" description="Upcoming scheduled executions across all workflows." />} />
        <Route path="/integrations" element={<PlaceholderPage icon={Plug} title="Integrations" description="Connect external services like email providers and help-desk systems." />} />
        <Route
          path="/credentials"
          element={
            <RequireRole roles={['workflow_admin', 'super_admin']}>
              <PlaceholderPage icon={KeyRound} title="Credentials" description="Encrypted credentials used by your integrations. Never exposed to the browser." />
            </RequireRole>
          }
        />
        <Route path="/notifications" element={<PlaceholderPage icon={Bell} title="Notifications" description="In-app alerts for failed runs and workflow completions." />} />
        <Route path="/analytics" element={<PlaceholderPage icon={BarChart3} title="Analytics" description="Execution volume, failure categories, and duration trends." />} />
        <Route
          path="/users"
          element={
            <RequireRole roles={['super_admin']}>
              <PlaceholderPage icon={Users} title="User Management" description="Manage user accounts and roles. Super admins only." />
            </RequireRole>
          }
        />
        <Route path="/audit" element={<PlaceholderPage icon={ScrollText} title="Audit Logs" description="A record of security-relevant actions: sign-ins, activations, role changes." />} />
        <Route path="/settings" element={<PlaceholderPage icon={Settings} title="Settings" description="Workspace preferences: retention days, concurrency limits, and more." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

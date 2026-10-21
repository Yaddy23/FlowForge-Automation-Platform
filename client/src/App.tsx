import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarClock, FileStack, BarChart3 } from 'lucide-react';
import { AuthProvider } from './lib/auth-context';
import { ToastProvider } from './components/ui/toast';
import AppLayout from './components/layout/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkflowsListPage from './pages/WorkflowsListPage';
import ExecutionsListPage from './pages/ExecutionsListPage';
import ExecutionDetailPage from './pages/ExecutionDetailPage';
import EditorPage from './workflow-editor/EditorPage';
import PlaceholderPage from './pages/PlaceholderPage';
import IntegrationsPage from './pages/IntegrationsPage';
import CredentialsPage from './pages/CredentialsPage';
import NotificationsPage from './pages/NotificationsPage';
import UsersPage from './pages/UsersPage';
import AuditLogPage from './pages/AuditLogPage';
import SettingsPage from './pages/SettingsPage';

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
        <Route path="/workflows" element={<WorkflowsListPage />} />
        {/* The sidebar already hides the builder from viewers; this guard makes
            the URL agree with it rather than letting a viewer open an editor
            whose Save button the API would reject. */}
        <Route
          path="/workflows/builder/:id"
          element={
            <RequireRole roles={['workflow_builder', 'workflow_admin', 'super_admin']}>
              <EditorPage />
            </RequireRole>
          }
        />
        <Route path="/workflows/:id/executions" element={<ExecutionsListPage />} />
        <Route path="/executions" element={<ExecutionsListPage />} />
        <Route path="/executions/:id" element={<ExecutionDetailPage />} />
        <Route path="/templates" element={<PlaceholderPage icon={FileStack} title="Templates" description="Ready-made workflow templates you can instantiate and customize." />} />
        <Route path="/scheduled" element={<PlaceholderPage icon={CalendarClock} title="Scheduled Runs" description="Upcoming scheduled executions across all workflows." />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route
          path="/credentials"
          element={
            <RequireRole roles={['workflow_admin', 'super_admin']}>
              <CredentialsPage />
            </RequireRole>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/analytics" element={<PlaceholderPage icon={BarChart3} title="Analytics" description="Execution volume, failure categories, and duration trends." />} />
        <Route
          path="/users"
          element={
            <RequireRole roles={['super_admin']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
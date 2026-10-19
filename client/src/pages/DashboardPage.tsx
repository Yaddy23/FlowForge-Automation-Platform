import { Activity } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <EmptyState
        icon={Activity}
        title="No workflow activity yet"
        description="Execution metrics, charts, and recent activity will appear here once workflows run. Use Templates to create your first workflow."
      />
    </div>
  );
}

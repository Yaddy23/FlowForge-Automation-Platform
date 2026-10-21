import { Activity, PieChart, Clock } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

interface WorkflowRun {
  _id: string;
  workflow: {
    _id: string;
    name: string;
  };
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  trigger: {
    type: 'manual' | 'schedule' | 'event' | 'webhook';
    [key: string]: unknown;
  };
  createdAt: string;
  finishedAt?: string;
}

interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  queued: number;
  cancelled: number;
  timedOut: number;
  manual: number;
  schedule: number;
  event: number;
  webhook: number;
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [stats, setStats] = useState<RunStats>({
    total: 0,
    succeeded: 0,
    failed: 0,
    running: 0,
    queued: 0,
    cancelled: 0,
    timedOut: 0,
    manual: 0,
    schedule: 0,
    event: 0,
    webhook: 0
  });
  const [dailyRuns, setDailyRuns] = useState<Array<{ date: string; count: number }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Only non-zero trigger types get a slice, so a manual-only workflow set does
  // not render three zero-width labels around the ring.
  const triggerData = [
    { name: 'Manual', value: stats.manual, fill: '#3b82f6' },
    { name: 'Schedule', value: stats.schedule, fill: '#10b981' },
    { name: 'Event', value: stats.event, fill: '#f59e0b' },
    { name: 'Webhook', value: stats.webhook, fill: '#ef4444' }
  ].filter((entry) => entry.value > 0);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch runs from the API (last 30 days for better stats)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const response = await apiGet<{ data: WorkflowRun[]; total: number }>(
        `/runs?from=${thirtyDaysAgo.toISOString()}&limit=100`
      );

      const fetchedRuns: WorkflowRun[] = response.data;

      setRuns(fetchedRuns);

      // Calculate statistics
      const calculatedStats = fetchedRuns.reduce((acc, run) => {
        acc.total++;
        switch (run.status) {
          case 'succeeded':
            acc.succeeded++;
            break;
          case 'failed':
            acc.failed++;
            break;
          case 'running':
            acc.running++;
            break;
          case 'queued':
            acc.queued++;
            break;
          case 'cancelled':
            acc.cancelled++;
            break;
          case 'timed_out':
            acc.timedOut++;
            break;
        }

        // Count trigger types
        const triggerType = run.trigger.type;
        if (triggerType === 'manual') acc.manual++;
        else if (triggerType === 'schedule') acc.schedule++;
        else if (triggerType === 'event') acc.event++;
        else if (triggerType === 'webhook') acc.webhook++;

        return acc;
      }, {
        total: 0,
        succeeded: 0,
        failed: 0,
        running: 0,
        queued: 0,
        cancelled: 0,
        timedOut: 0,
        manual: 0,
        schedule: 0,
        event: 0,
        webhook: 0
      });

      setStats(calculatedStats);

      // Calculate daily runs for the last 7 days
      const dailyCounts = calculateDailyRuns(fetchedRuns);
      setDailyRuns(dailyCounts);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const calculateDailyRuns = (runs: WorkflowRun[]): Array<{ date: string; count: number }> => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6); // Last 7 days including today

    // Initialize counts for each of the last 7 days
    const dayCounts: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      dayCounts[dateString] = 0;
    }

    // Count runs for each day
    runs.forEach(run => {
      const runDate = new Date(run.createdAt);
      const dateString = runDate.toISOString().split('T')[0];
      if (dayCounts[dateString] !== undefined) {
        dayCounts[dateString]++;
      }
    });

    // Convert to array and sort by date (oldest first)
    return Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>Error loading dashboard data: {error}</p>
        </div>
        <EmptyState
          icon={Activity}
          title="Unable to load dashboard"
          description="Please check your connection and try again."
        />
      </div>
    );
  }

  if (runs.length === 0 && !loading) {
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

  const successRate = stats.total > 0 ? Math.round((stats.succeeded / stats.total) * 100) : 0;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Runs</h3>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Success Rate</h3>
          <p className="text-3xl font-bold text-green-600">{successRate}%</p>
          <p className="text-xs text-gray-500">{stats.succeeded}/{stats.total} successful</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Currently Running</h3>
          <p className="text-3xl font-bold text-blue-600">{stats.running}</p>
          <p className="text-xs text-gray-500">{stats.queued} queued</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Failed Runs</h3>
          <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
          <p className="text-xs text-gray-500">{stats.timedOut} timed out, {stats.cancelled} cancelled</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily Runs Trend */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-4 flex items-center">
            <Clock className="mr-2 h-4 w-4 text-gray-400" />
            Workflow Runs (Last 7 Days)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRuns}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(value: string) => {
                  const d = new Date(value);
                  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trigger Type Breakdown */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-4 flex items-center">
            <PieChart className="mr-2 h-4 w-4 text-gray-400" />
            Trigger Type Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie data={triggerData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {triggerData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => `${name}: ${value}`} />
                <Legend />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="text-sm font-medium text-gray-500 mb-4 flex items-center">
          <Activity className="mr-2 h-4 w-4 text-gray-400" />
          Recent Activity
        </h3>
        {runs.slice(0, 5).map((run) => (
          <div key={run._id} className="flex justify-between items-start p-3 border-t border-gray-100 first:border-t-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-start">
                <div className="mr-2 h-3 w-3 rounded-full">
                  {run.status === 'succeeded' && <div className="bg-green-500" />}
                  {run.status === 'failed' && <div className="bg-red-500" />}
                  {run.status === 'running' && <div className="bg-blue-500 animate-pulse" />}
                  {run.status === 'queued' && <div className="bg-yellow-500" />}
                  {run.status === 'cancelled' && <div className="bg-gray-500" />}
                  {run.status === 'timed_out' && <div className="bg-orange-500" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{run.workflow.name}</p>
                  <p className="text-sm text-gray-500">
                    {run.trigger.type === 'manual' && 'Manual'}
                    {run.trigger.type === 'schedule' && 'Schedule'}
                    {run.trigger.type === 'event' && 'Event'}
                    {run.trigger.type === 'webhook' && 'Webhook'}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {new Date(run.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-right text-xs">
              <p className="font-medium">
                {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
              </p>
              {run.finishedAt && (
                <p className="text-sm text-gray-500">
                  Finished: {new Date(run.finishedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        ))}
        {runs.length === 0 && (
          <p className="text-center text-gray-500 py-4">No recent activity</p>
        )}
      </div>
    </div>
  );
}
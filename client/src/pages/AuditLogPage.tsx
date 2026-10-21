import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';

interface AuditLog {
  _id: string;
  action: string;
  targetType: string;
  targetId?: string;
  meta?: Record<string, any>;
  createdAt: string;
  actorId?: {
    name: string;
    email: string;
  };
}

export default function AuditLogPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);
  const [filters, setFilters] = useState({
    action: '',
    targetType: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchAuditLogs();
  }, [page, limit, filters]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.targetType && { targetType: filters.targetType }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate })
      });
      const data = await apiGet<{
        auditLogs: AuditLog[];
        pagination: {
          total: number;
          page: number;
          limit: number;
          pages: number;
        }
      }>(`/audit-logs?${params}`);
      setAuditLogs(data.auditLogs);
    } catch (err) {
      setError('Failed to load audit logs');
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      action: '',
      targetType: '',
      startDate: '',
      endDate: ''
    });
    setPage(1);
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Audit Logs</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Audit Logs</h1>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <p className="mb-4 text-sm text-gray-500">
        View security-relevant actions: sign-ins, activations, role changes.
      </p>

      {/* Filters */}
      <div className="mb-6 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Filters</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Action
            </label>
            <input
              type="text"
              value={filters.action}
              onChange={(e) => {
                setFilters(prev => ({ ...prev, action: e.target.value }));
                setPage(1); // Reset to first page when filter changes
              }}
              placeholder="e.g., USER_LOGIN, WORKFLOW_EXECUTE"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Type
            </label>
            <input
              type="text"
              value={filters.targetType}
              onChange={(e) => {
                setFilters(prev => ({ ...prev, targetType: e.target.value }));
                setPage(1); // Reset to first page when filter changes
              }}
              placeholder="e.g., User, Workflow"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                setFilters(prev => ({ ...prev, startDate: e.target.value }));
                setPage(1); // Reset to first page when filter changes
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                setFilters(prev => ({ ...prev, endDate: e.target.value }));
                setPage(1); // Reset to first page when filter changes
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={fetchAuditLogs}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Apply Filters
          </button>
          <button
            onClick={handleResetFilters}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stats */}
      {auditLogs.length > 0 && (
        <div className="mb-6 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Statistics</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">
                {/* This would come from a separate stats API call */}
                {auditLogs.length}+
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Today</p>
              <p className="text-2xl font-bold text-gray-900">
                {/* This would come from a separate stats API call */}
                {auditLogs.filter(log =>
                  new Date(log.createdAt).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">This Week</p>
              <p className="text-2xl font-bold text-gray-900">
                {/* This would come from a separate stats API call */}
                {auditLogs.filter(log => {
                  const logDate = new Date(log.createdAt);
                  const today = new Date();
                  const oneWeekAgo = new Date(today);
                  oneWeekAgo.setDate(today.getDate() - 7);
                  return logDate >= oneWeekAgo && logDate <= today;
                }).length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Audit Log Entries</h2>
        {auditLogs.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No audit logs found.
          </p>
        ) : (
          <div className="space-y-4">
            {auditLogs.map((log) => (
              <div key={log._id} className="border-t border-gray-200 pt-4 first:border-t-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {log.actorId?.name || 'Unknown User'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {log.actorId?.email || 'no-email@example.com'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {log.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    {log.targetType && log.targetId && (
                      <p className="text-xs text-gray-400 mt-1">
                        Target: {log.targetType} #{log.targetId}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
                {log.meta && Object.keys(log.meta).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="font-medium text-gray-700 mb-2">Metadata:</p>
                    <pre className="bg-gray-50 p-3 rounded text-sm">{JSON.stringify(log.meta, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface Integration {
  _id: string;
  name: string;
  type: string; // e.g., 'webhook', 'email', 'helpdesk'
  status: 'connected' | 'disconnected' | 'error';
  lastUsed?: string;
  credentialId?: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      setError(null);
      // For now, we'll return mock data since we don't have a real API yet
      // In a real implementation, this would call /api/integrations
      const mockData: Integration[] = [
        {
          _id: '1',
          name: 'Webhook Out',
          type: 'webhook',
          status: 'disconnected',
        },
        {
          _id: '2',
          name: 'Email Notification',
          type: 'email',
          status: 'disconnected',
        },
        {
          _id: '3',
          name: 'Yad-IT Help-Desk',
          type: 'helpdesk',
          status: 'disconnected',
        },
      ];
      setIntegrations(mockData);
    } catch (err) {
      setError('Failed to load integrations');
      console.error('Error fetching integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchIntegrations();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Integrations</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Integrations</h1>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Integrations</h1>
      <p className="mb-4 text-sm text-gray-500">
        Connect and manage external services for use in your workflows.
      </p>

      {/* Refresh Button */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
          <RefreshCw className="ml-2 h-4 w-4" />
        </button>
      </div>

      {/* Integrations List */}
      <div className="space-y-4">
        {integrations.map((integration) => (
          <div key={integration._id} className="border border-gray-200 rounded-lg p-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-medium text-gray-900">{integration.name}</h2>
                <p className="text-sm text-gray-500">
                  {integration.type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
                {integration.lastUsed && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last used: {new Date(integration.lastUsed).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    integration.status === 'connected'
                      ? 'bg-green-100 text-green-800'
                      : integration.status === 'error'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {integration.status.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                To use this integration in your workflows, select it from the
                action panel in the workflow editor. You'll need to configure
                any required credentials first.
              </p>
              {/* In a real implementation, this would have configuration fields */}
              <div className="mt-3">
                <button
                  disabled={true}
                  className="text-sm text-gray-500 cursor-not-allowed"
                >
                  Configure
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { Trash2 } from 'lucide-react';

interface Credential {
  _id: string;
  name: string;
  credentialType: string;
  createdAt: string;
  updatedAt: string;
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createName, setCreateName] = useState<string>('');
  const [createType, setCreateType] = useState<string>('');
  const [createValue, setCreateValue] = useState<string>('');

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<Credential[]>('/credentials');
      setCredentials(data);
    } catch (err) {
      setError('Failed to load credentials');
      console.error('Error fetching credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName || !createType || !createValue) {
      setCreateError('All fields are required');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      await apiPost('/credentials', {
        name: createName,
        credentialType: createType,
        value: createValue,
      });
      setCreateName('');
      setCreateType('');
      setCreateValue('');
      setCreateError(null);
      await fetchCredentials();
    } catch (err) {
      setCreateError('Failed to create credential');
      console.error('Error creating credential:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/credentials/${id}`);
      await fetchCredentials();
    } catch (err) {
      setError('Failed to delete credential');
      console.error('Error deleting credential:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Credentials</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Credentials</h1>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Credentials</h1>
      <p className="mb-4 text-sm text-gray-500">
        Store encrypted credentials for use in integrations. Credentials are
        encrypted at rest and never returned in plaintext.
      </p>

      {/* Create Credential Form */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Add New Credential</h2>
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name
            </label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Enter a name for this credential"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type
            </label>
            <select
              value={createType}
              onChange={(e) => setCreateType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
            >
              <option value="">Select credential type</option>
              <option value="api-key">API Key</option>
              <option value="oauth-token">OAuth Token</option>
              <option value="basic-auth">Basic Auth</option>
              <option value="bearer-token">Bearer Token</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Value
            </label>
            <input
              type="password"
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
              placeholder="Enter the credential value"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
            />
          </div>
          {createError && (
            <p className="text-sm text-red-600">{createError}</p>
          )}
          <button
            type="submit"
            disabled={creating || !(createName && createType && createValue)}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Add Credential'}
          </button>
        </form>
      </div>

      {/* Credentials List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Your Credentials</h2>
        {credentials.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No credentials yet. Add your first credential above.
          </p>
        ) : (
          <div className="space-y-4">
            {credentials.map((cred) => (
              <div key={cred._id} className="border-t border-gray-200 pt-4 first:border-t-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">{cred.name}</h3>
                    <p className="text-sm text-gray-500">
                      {cred.credentialType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-xs text-gray-400">
                      Created: {new Date(cred.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleDelete(cred._id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
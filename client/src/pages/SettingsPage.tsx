import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../lib/api';

interface Setting {
  _id: string;
  key: string;
  value: any;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ settings: Setting[] }>('/settings');
      setSettings(data.settings);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeSettings = async () => {
    try {
      setInitializing(true);
      setInitError(null);
      await apiPost('/settings/initialize');
      await fetchSettings();
    } catch (err) {
      setInitError('Failed to initialize default settings');
      console.error('Error initializing settings:', err);
    } finally {
      setInitializing(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: any, description: string) => {
    try {
      await apiPost('/settings', { key, value, description });
      await fetchSettings();
    } catch (err) {
      setError('Failed to update setting');
      console.error('Error updating setting:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <p className="mb-4 text-sm text-gray-500">
        Manage system-wide settings and configurations.
      </p>

      {/* Initialize Default Settings */}
      <div className="mb-6 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">System Initialization</h2>
        <p className="text-sm text-gray-500">
          Initialize default system settings if they haven't been set yet.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleInitializeSettings}
            disabled={initializing}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            {initializing ? 'Initializing...' : 'Initialize Default Settings'}
          </button>
          {initError && (
            <span className="text-sm text-red-600 ml-2">
              {initError}
            </span>
          )}
        </div>
      </div>

      {/* Settings List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Current Settings</h2>
        {settings.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No settings found. Click "Initialize Default Settings" above to set up default values.
          </p>
        ) : (
          <div className="space-y-4">
            {settings.map((setting) => (
              <div key={setting._id} className="border-t border-gray-200 pt-4 first:border-t-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {setting.key}
                    </h3>
                    {setting.description && (
                      <p className="text-sm text-gray-500">
                        {setting.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      Updated: {new Date(setting.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="px-3 py-1 rounded-full text-xs font-medium
                      bg-blue-100 text-blue-800
                    ">
                      {typeof setting.value === 'boolean'
                        ? (setting.value ? 'Enabled' : 'Disabled')
                        : String(setting.value)
                      }
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Update Setting Form */}
      <div className="mt-6 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Add or Update Setting</h2>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Setting Key
            </label>
            <input
              type="text"
              id="setting-key"
              placeholder="e.g., retentionDays, maxConcurrentWorkflows"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Value
            </label>
            <input
              type="text"
              id="setting-value"
              placeholder="Enter value (text, number, boolean, etc.)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <input
              type="text"
              id="setting-description"
              placeholder="Describe what this setting controls"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const key = (document.getElementById('setting-key') as HTMLInputElement)?.value;
                const value = (document.getElementById('setting-value') as HTMLInputElement)?.value;
                const description = (document.getElementById('setting-description') as HTMLInputElement)?.value;

                if (!key) {
                  alert('Setting key is required');
                  return;
                }

                // Try to parse as JSON for numbers, booleans, objects
                let parsedValue: any = value;
                try {
                  parsedValue = JSON.parse(value);
                } catch (e) {
                  // Keep as string if not valid JSON
                  parsedValue = value;
                }

                handleUpdateSetting(key, parsedValue, description || '');

                // Clear form
                (document.getElementById('setting-key') as HTMLInputElement).value = '';
                (document.getElementById('setting-value') as HTMLInputElement).value = '';
                (document.getElementById('setting-description') as HTMLInputElement).value = '';
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Save Setting
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
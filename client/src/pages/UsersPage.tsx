import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';
import { Plus, Trash2, Edit } from 'lucide-react';

interface User {
  _id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createEmail, setCreateEmail] = useState<string>('');
  const [createName, setCreateName] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [createRole, setCreateRole] = useState<string>('viewer');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [filters, setFilters] = useState({
    search: '',
    role: ''
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editRole, setEditRole] = useState<string>('');

  useEffect(() => {
    fetchUsers();
  }, [page, limit, filters]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.search && { search: filters.search }),
        ...(filters.role && { role: filters.role })
      });
      const data = await apiGet<{
        users: User[];
        pagination: {
          total: number;
          page: number;
          limit: number;
          pages: number;
        }
      }>(`/users?${params}`);
      setUsers(data.users);
      setTotalPages(data.pagination.pages);
    } catch (err) {
      setError('Failed to load users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail || !createName || !createPassword || !createRole) {
      setCreateError('All fields are required');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      await apiPost('/users', {
        email: createEmail,
        name: createName,
        password: createPassword,
        role: createRole
      });
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('');
      setCreateRole('viewer');
      setCreateError(null);
      await fetchUsers();
    } catch (err) {
      setCreateError('Failed to create user');
      console.error('Error creating user:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateSubmit = async (userId: string) => {
    if (!editName || !editRole) {
      return;
    }

    try {
      await apiPut(`/users/${userId}`, {
        name: editName,
        role: editRole
      });
      setEditingUserId(null);
      await fetchUsers();
    } catch (err) {
      console.error('Error updating user:', err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await apiDelete(`/users/${id}`);
      await fetchUsers();
    } catch (err) {
      setError('Failed to delete user');
      console.error('Error deleting user:', err);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      role: ''
    });
    setPage(1);
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">User Management</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">User Management</h1>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">User Management</h1>
      <p className="mb-4 text-sm text-gray-500">
        Manage user accounts and roles. Super admins only.
      </p>

      {/* Controls */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-width-0">
          <h2 className="text-xl font-bold mb-4">Filters</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, search: e.target.value }));
                  setPage(1);
                }}
                placeholder="Search by name or email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                value={filters.role}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, role: e.target.value }));
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="workflow_admin">Workflow Admin</option>
                <option value="workflow_builder">Workflow Builder</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={fetchUsers}
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
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setCreating(true)}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            <Plus className="ml-2 h-4 w-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Create User Form */}
      {creating && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Add New User</h2>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="Enter email address"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={creating}
              >
                <option value="">Select Role</option>
                <option value="super_admin">Super Admin</option>
                <option value="workflow_admin">Workflow Admin</option>
                <option value="workflow_builder">Workflow Builder</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            {createError && (
              <p className="text-sm text-red-600">
                {createError}
              </p>
            )}
            <button
              type="submit"
              disabled={creating || !(createEmail && createName && createPassword && createRole)}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Add User'}
            </button>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Users List</h2>
        {users.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No users found.
          </p>
        ) : (
          <div className="space-y-4">
            {users.map((user) => (
              <div key={user._id} className="border-t border-gray-200 pt-4 first:border-t-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {user.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {user.email}
                    </p>
                    <p className="text-xs text-gray-400">
                      Role: {user.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-xs text-gray-400">
                      Created: {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    {editingUserId === user._id ? (
                      <>
                        <input
                          value={editName || user.name}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mb-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={editRole || user.role}
                          onChange={(e) => {
                            setEditRole(e.target.value);
                            if (e.target.value) {
                              setEditingUserId(null);
                              handleUpdateSubmit(user._id);
                            }
                          }}
                          className="mb-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Role</option>
                          <option value="super_admin">Super Admin</option>
                          <option value="workflow_admin">Workflow Admin</option>
                          <option value="workflow_builder">Workflow Builder</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingUserId(user._id);
                            setEditName(user.name);
                            setEditRole(user.role);
                          }}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user._id)}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
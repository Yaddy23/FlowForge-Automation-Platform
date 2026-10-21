import { useState, useEffect } from 'react';
import { apiGet, apiPut, apiDelete } from '../lib/api';
import { RefreshCw, X } from 'lucide-react';

interface Notification {
  _id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  useEffect(() => {
    fetchNotifications();
  }, [page, limit, unreadOnly]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(unreadOnly ? { unreadOnly: 'true' } : {})
      });
      const data = await apiGet<{
        notifications: Notification[];
        pagination: {
          total: number;
          page: number;
          limit: number;
          pages: number;
        }
      }>(`/notifications?${params}`);
      setNotifications(data.notifications);
      setTotalPages(data.pagination.pages);
    } catch (err) {
      setError('Failed to load notifications');
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiPut(`/notifications/${id}/read`);
      await fetchNotifications();
    } catch (err) {
      setError('Failed to mark notification as read');
      console.error('Error marking notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiPut(`/notifications/read-all`);
      await fetchNotifications();
    } catch (err) {
      setError('Failed to mark all notifications as read');
      console.error('Error marking all notifications as read:', err);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await apiDelete(`/notifications/${id}`);
      await fetchNotifications();
    } catch (err) {
      setError('Failed to delete notification');
      console.error('Error deleting notification:', err);
    }
  };

  const handleDeleteAllNotifications = async () => {
    try {
      await apiDelete(`/notifications`);
      await fetchNotifications();
    } catch (err) {
      setError('Failed to delete all notifications');
      console.error('Error deleting all notifications:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Notifications</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Notifications</h1>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Notifications</h1>
      <p className="mb-4 text-sm text-gray-500">
        View and manage your in-app notifications.
      </p>

      {/* Controls */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1); // Reset to first page when filter changes
              }}
              className="h-4 w-4 text-blue-600"
            />
            Show unread only
          </label>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleMarkAllAsRead}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Mark All as Read
          </button>
          <button
            onClick={handleDeleteAllNotifications}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Delete All
          </button>
          <button
            onClick={fetchNotifications}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            <RefreshCw className="ml-2 h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          No notifications yet.
        </p>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <div
              key={notification._id}
              className={`border border-gray-200 rounded-lg p-6 ${
                !notification.read ? 'bg-blue-50' : 'bg-white'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-gray-900">{notification.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  {!notification.read && (
                    <button
                      onClick={() => handleMarkAsRead(notification._id)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Mark as Read
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteNotification(notification._id)}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
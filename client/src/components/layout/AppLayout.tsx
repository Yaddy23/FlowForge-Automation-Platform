import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CalendarClock,
  FileStack,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Plug,
  ScrollText,
  Search,
  Settings,
  Sun,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from 'shared/types/user';
import { useAuth } from '../../lib/auth-context';
import { useTheme } from '../../lib/use-theme';

const ALL_ROLES: Role[] = ['super_admin', 'workflow_admin', 'workflow_builder', 'viewer'];
const ADMIN_PLUS: Role[] = ['workflow_admin', 'super_admin'];

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: Role[];
}

/** The 13 spec sidebar items, restricted by role where the API restricts them. */
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, roles: ALL_ROLES },
  { label: 'Workflows', to: '/workflows', icon: Workflow, roles: ALL_ROLES },
  { label: 'Workflow Builder', to: '/workflows', icon: GitBranch, roles: ['workflow_builder', ...ADMIN_PLUS] },
  { label: 'Templates', to: '/templates', icon: FileStack, roles: ALL_ROLES },
  { label: 'Executions', to: '/executions', icon: PlayCircle, roles: ALL_ROLES },
  { label: 'Scheduled Runs', to: '/scheduled', icon: CalendarClock, roles: ALL_ROLES },
  { label: 'Integrations', to: '/integrations', icon: Plug, roles: ALL_ROLES },
  { label: 'Credentials', to: '/credentials', icon: KeyRound, roles: ADMIN_PLUS },
  { label: 'Notifications', to: '/notifications', icon: Bell, roles: ALL_ROLES },
  { label: 'Analytics', to: '/analytics', icon: BarChart3, roles: ALL_ROLES },
  { label: 'User Management', to: '/users', icon: Users, roles: ['super_admin'] },
  { label: 'Audit Logs', to: '/audit', icon: ScrollText, roles: ALL_ROLES },
  { label: 'Settings', to: '/settings', icon: Settings, roles: ALL_ROLES },
];

const COLLAPSE_KEY = 'flowforge.sidebar-collapsed';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Sidebar */}
      <aside
        className={`sticky top-0 flex h-screen flex-col border-r border-zinc-200 bg-white transition-[width] dark:border-zinc-800 dark:bg-zinc-900 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
        aria-label="Sidebar"
      >
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <Zap className="h-6 w-6 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
          {!collapsed && <span className="text-lg font-bold">FlowForge</span>}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {visibleItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                } ${collapsed ? 'justify-center px-0' : ''}`
              }
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" aria-hidden />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 md:hidden"
            aria-label="Open menu"
            onClick={() => setCollapsed(false)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="relative w-full max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search workflows, executions…"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:ring-indigo-900"
              aria-label="Search"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {(user?.name ?? '?')
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span className="hidden sm:inline">{user?.name}</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="border-b border-zinc-200 px-3 pb-2 dark:border-zinc-700">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user?.email}</p>
                    <p className="mt-1 text-xs capitalize text-indigo-600 dark:text-indigo-400">
                      {user?.role.replace('_', ' ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

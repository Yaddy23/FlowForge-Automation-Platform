import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from 'shared/types/user';
import { useAuth } from '../lib/auth-context';

interface RequireRoleProps {
  roles: Role[];
  children: ReactNode;
}

/** Renders children only for the allowed roles; otherwise redirects home. */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

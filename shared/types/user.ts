export type Role = 'super_admin' | 'workflow_admin' | 'workflow_builder' | 'viewer';

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: Role;
}
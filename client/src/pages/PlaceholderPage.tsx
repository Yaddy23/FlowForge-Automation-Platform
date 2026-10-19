import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

interface PlaceholderPageProps {
  icon?: LucideIcon;
  title: string;
  description: string;
}

/** Temporary page for routes whose implementation lands in a later task. */
export default function PlaceholderPage({ icon, title, description }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      <EmptyState icon={icon} title={`${title} coming soon`} description={description} />
    </div>
  );
}

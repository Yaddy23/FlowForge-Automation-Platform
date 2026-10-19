import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

/** Shared empty-state used by placeholder and list pages. */
export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      {Icon ? (
        <Icon className="h-10 w-10 text-zinc-400 dark:text-zinc-500" aria-hidden />
      ) : null}
      <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-200">{title}</h2>
      {description ? (
        <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      ) : null}
    </div>
  );
}

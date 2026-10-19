import {
  Bell,
  Braces,
  CalendarClock,
  Database,
  FileDown,
  Filter,
  GitBranch,
  Globe,
  KeyRound,
  Mail,
  MessageSquare,
  PlayCircle,
  Scale,
  Send,
  ShieldCheck,
  Timer,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { NodeKind } from 'shared/types/workflow';

export type NodeCategory = 'trigger' | 'condition' | 'logic' | 'action';

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface NodeKindMeta {
  kind: NodeKind;
  label: string;
  category: NodeCategory;
  icon: LucideIcon;
  description: string;
  fields: FieldSpec[];
}

/**
 * Frontend mirror of the server's node registry (Task 5): drives the palette,
 * per-kind config panel, and client-side validation. The server registry stays
 * the authority — this is for UX only.
 */
export const NODE_KINDS: NodeKindMeta[] = [
  // Triggers
  {
    kind: 'trigger.manual',
    label: 'Manual Trigger',
    category: 'trigger',
    icon: PlayCircle,
    description: 'Run this workflow on demand.',
    fields: [],
  },
  {
    kind: 'trigger.schedule',
    label: 'Schedule Trigger',
    category: 'trigger',
    icon: CalendarClock,
    description: 'Run on a schedule.',
    fields: [
      {
        key: 'type',
        label: 'Frequency',
        type: 'select',
        options: [
          { value: 'once', label: 'Once' },
          { value: 'hourly', label: 'Hourly' },
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'cron', label: 'Cron expression' },
        ],
      },
      { key: 'cron', label: 'Cron expression', type: 'text', placeholder: '0 9 * * 1-5' },
      { key: 'timezone', label: 'Timezone', type: 'text', placeholder: 'UTC' },
    ],
  },
  {
    kind: 'trigger.webhook',
    label: 'Webhook Trigger',
    category: 'trigger',
    icon: Webhook,
    description: 'Run when an HTTP webhook is received.',
    fields: [],
  },
  {
    kind: 'trigger.event',
    label: 'Event Trigger',
    category: 'trigger',
    icon: Globe,
    description: 'Run when an internal event fires.',
    fields: [{ key: 'eventName', label: 'Event name', type: 'text', required: true, placeholder: 'ticket.created' }],
  },

  // Logic
  {
    kind: 'condition',
    label: 'Condition',
    category: 'condition',
    icon: Scale,
    description: 'Evaluate a single condition.',
    fields: [
      { key: 'leftPath', label: 'Left value (dot path)', type: 'text', required: true, placeholder: 'payload.priority' },
      {
        key: 'operator',
        label: 'Operator',
        type: 'select',
        required: true,
        options: [
          { value: 'equals', label: 'equals' },
          { value: 'not_equals', label: 'not equals' },
          { value: 'gt', label: 'greater than' },
          { value: 'lt', label: 'less than' },
          { value: 'contains', label: 'contains' },
          { value: 'is_empty', label: 'is empty' },
          { value: 'is_true', label: 'is true' },
          { value: 'is_false', label: 'is false' },
        ],
      },
      { key: 'right', label: 'Right value', type: 'text', placeholder: 'critical' },
    ],
  },
  {
    kind: 'branch',
    label: 'Branch (if/else)',
    category: 'logic',
    icon: GitBranch,
    description: 'Route execution down matching branches.',
    fields: [],
  },

  // Actions
  {
    kind: 'action.email',
    label: 'Send Email',
    category: 'action',
    icon: Mail,
    description: 'Send an email.',
    fields: [
      { key: 'to', label: 'To', type: 'text', required: true, placeholder: 'person@example.com' },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'body', label: 'Body', type: 'textarea' },
    ],
  },
  {
    kind: 'action.notify',
    label: 'In-App Notification',
    category: 'action',
    icon: Bell,
    description: 'Create an in-app notification.',
    fields: [{ key: 'message', label: 'Message', type: 'textarea', required: true }],
  },
  {
    kind: 'action.webhook',
    label: 'Outbound Webhook',
    category: 'action',
    icon: Send,
    description: 'Call an external HTTP endpoint.',
    fields: [
      { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://…' },
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        options: [
          { value: 'POST', label: 'POST' },
          { value: 'GET', label: 'GET' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
        ],
      },
    ],
  },
  {
    kind: 'action.transform',
    label: 'Transform JSON',
    category: 'action',
    icon: Braces,
    description: 'Reshape the run data.',
    fields: [{ key: 'mappings', label: 'Mappings (JSON)', type: 'textarea', placeholder: '{"key": "{{payload.x}}"}' }],
  },
  {
    kind: 'action.filter',
    label: 'Filter Items',
    category: 'action',
    icon: Filter,
    description: 'Keep only matching items.',
    fields: [{ key: 'expression', label: 'Expression', type: 'text', placeholder: 'item.status == "open"' }],
  },
  {
    kind: 'action.validate',
    label: 'Validate Data',
    category: 'action',
    icon: ShieldCheck,
    description: 'Validate against a JSON schema.',
    fields: [{ key: 'schema', label: 'JSON Schema', type: 'textarea', required: true }],
  },
  {
    kind: 'action.report',
    label: 'Generate Report',
    category: 'action',
    icon: FileDown,
    description: 'Aggregate and format a report.',
    fields: [{ key: 'title', label: 'Title', type: 'text' }],
  },
  {
    kind: 'action.csv',
    label: 'Process CSV',
    category: 'action',
    icon: FileDown,
    description: 'Parse or generate CSV data.',
    fields: [{ key: 'operation', label: 'Operation', type: 'select', options: [{ value: 'parse', label: 'Parse' }, { value: 'generate', label: 'Generate' }] }],
  },
  {
    kind: 'action.delay',
    label: 'Delay',
    category: 'action',
    icon: Timer,
    description: 'Wait before continuing.',
    fields: [{ key: 'durationMs', label: 'Duration (ms)', type: 'number', required: true }],
  },
  {
    kind: 'action.log',
    label: 'Log Message',
    category: 'action',
    icon: MessageSquare,
    description: 'Write a message to the run log.',
    fields: [{ key: 'message', label: 'Message', type: 'text' }],
  },
  {
    kind: 'action.reference',
    label: 'Generate Reference',
    category: 'action',
    icon: KeyRound,
    description: 'Generate a unique reference code.',
    fields: [{ key: 'prefix', label: 'Prefix', type: 'text', placeholder: 'FF' }],
  },
  {
    kind: 'action.record.create',
    label: 'Create Record',
    category: 'action',
    icon: Database,
    description: 'Insert a record (whitelisted collections).',
    fields: [
      { key: 'collection', label: 'Collection', type: 'text', required: true },
      { key: 'data', label: 'Data (JSON)', type: 'textarea', required: true },
    ],
  },
  {
    kind: 'action.record.update',
    label: 'Update Record',
    category: 'action',
    icon: Database,
    description: 'Update records (whitelisted collections).',
    fields: [
      { key: 'collection', label: 'Collection', type: 'text', required: true },
      { key: 'filter', label: 'Filter (JSON)', type: 'textarea', required: true },
      { key: 'data', label: 'Data (JSON)', type: 'textarea', required: true },
    ],
  },
];

const KIND_MAP = new Map<string, NodeKindMeta>(NODE_KINDS.map((m) => [m.kind, m]));

export function getKindMeta(kind: string): NodeKindMeta | undefined {
  return KIND_MAP.get(kind);
}

export const CATEGORY_STYLES: Record<NodeCategory, { badge: string; node: string; ring: string }> = {
  trigger: {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    node: 'border-emerald-400 dark:border-emerald-600',
    ring: 'ring-emerald-400',
  },
  condition: {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    node: 'border-amber-400 dark:border-amber-600',
    ring: 'ring-amber-400',
  },
  logic: {
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    node: 'border-sky-400 dark:border-sky-600',
    ring: 'ring-sky-400',
  },
  action: {
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    node: 'border-violet-400 dark:border-violet-600',
    ring: 'ring-violet-400',
  },
};

import mongoose from 'mongoose';
import User from '../models/User';
import WorkflowTemplate from '../models/WorkflowTemplate';
import { ticketAlertDefinition } from '../data/templates/ticket-alert';
import { weeklyReportDefinition } from '../data/templates/weekly-report';
import { warrantyReminderDefinition } from '../data/templates/warranty-reminder';
import { lowInventoryDefinition } from '../data/templates/low-inventory';
import { csvValidationDefinition } from '../data/templates/csv-validation';

export const DEMO_PASSWORD = 'Demo123!';

const demoUsers = [
  { email: 'admin@flowforge.dev', name: 'Admin', role: 'super_admin' as const },
  { email: 'wfadmin@flowforge.dev', name: 'WF Admin', role: 'workflow_admin' as const },
  { email: 'builder@flowforge.dev', name: 'Builder', role: 'workflow_builder' as const },
  { email: 'viewer@flowforge.dev', name: 'Viewer', role: 'viewer' as const },
];

/**
 * Idempotent demo-account seeding: creates each user if missing (via save(),
 * so the bcrypt pre-save hook hashes the password); existing users get
 * name/role refreshed but their password is left untouched.
 * Callers must have an active mongoose connection.
 */
export async function seedDemoUsers(): Promise<string[]> {
  const emails: string[] = [];
  for (const u of demoUsers) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      await new User({ email: u.email, name: u.name, role: u.role, password: DEMO_PASSWORD }).save();
    } else {
      existing.name = u.name;
      existing.role = u.role;
      await existing.save();
    }
    emails.push(u.email);
    console.log(`Ensured user ${u.email} (${u.role})`);
  }
  return emails;
}

/**
 * Idempotent seeding of built-in workflow templates A-E.
 * Creates each template if missing (by name); existing templates get
 * definition refreshed but name/description left untouched.
 * Callers must have an active mongoose connection.
 */
export async function seedTemplates(): Promise<string[]> {
  const templates: Array<{ name: string; definition: unknown; description?: string }> = [
    { name: 'Critical Ticket Alert', definition: ticketAlertDefinition, description: 'Alert on critical tickets' },
    { name: 'Weekly Report', definition: weeklyReportDefinition, description: 'Weekly workflow report' },
    { name: 'Warranty Reminder', definition: warrantyReminderDefinition, description: 'Asset warranty expiration reminder' },
    { name: 'Low Inventory', definition: lowInventoryDefinition, description: 'Low inventory notification' },
    { name: 'CSV Validation', definition: csvValidationDefinition, description: 'Validate CSV data' },
  ];

  const names: string[] = [];
  for (const t of templates) {
    const existing = await WorkflowTemplate.findOne({ name: t.name });
    if (!existing) {
      await new WorkflowTemplate({ name: t.name, definition: t.definition, description: t.description }).save();
    } else {
      existing.definition = t.definition;
      // optionally update description if desired
      await existing.save();
    }
    names.push(t.name);
    console.log(`Ensured template ${t.name}`);
  }
  return names;
}

const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/scripts/seed.ts');

if (invokedDirectly) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/flowforge';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      await seedDemoUsers();
      await seedTemplates();
    })
    .then(() => console.log('Seeded 4 demo accounts and 5 workflow templates'))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}
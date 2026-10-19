import mongoose from 'mongoose';
import User from '../models/User';

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

const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/scripts/seed.ts');

if (invokedDirectly) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/flowforge';
  mongoose
    .connect(mongoUri)
    .then(seedDemoUsers)
    .then(() => console.log('Seeded 4 demo accounts'))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import User from '../src/models/User';
import WorkflowTemplate from '../src/models/WorkflowTemplate';
import Workflow from '../src/models/Workflow';
import WorkflowVersion from '../src/models/WorkflowVersion';
import { validateDefinition } from '../src/services/workflow-validator.service';
import { ticketAlertDefinition } from '../src/data/templates/ticket-alert';
import { weeklyReportDefinition } from '../src/data/templates/weekly-report';
import { warrantyReminderDefinition } from '../src/data/templates/warranty-reminder';
import { lowInventoryDefinition } from '../src/data/templates/low-inventory';
import { csvValidationDefinition } from '../src/data/templates/csv-validation';

let mongo: MongoMemoryServer;
let adminToken: string;
let adminId: string;

const adminEmail = 'admin@flowforge.dev';
const adminPassword = 'Password123!';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.deleteMany({});
  const admin = await User.create({
    email: adminEmail,
    name: 'Admin',
    role: 'workflow_admin',
    password: adminPassword,
  });
  adminId = String(admin._id);
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: adminPassword });
  adminToken = loginRes.body.accessToken as string;

  // Insert the five templates into the database
  await WorkflowTemplate.insertMany([
    { name: 'Critical Ticket Alert', description: 'Alert on critical tickets', definition: ticketAlertDefinition },
    { name: 'Weekly Report', description: 'Weekly workflow report', definition: weeklyReportDefinition },
    { name: 'Warranty Reminder', description: 'Asset warranty expiration reminder', definition: warrantyReminderDefinition },
    { name: 'Low Inventory', description: 'Low inventory notification', definition: lowInventoryDefinition },
    { name: 'CSV Validation', description: 'Validate CSV data', definition: csvValidationDefinition },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Built-in workflow templates A-E', () => {
  it('all templates pass validation', async () => {
    const templates = await WorkflowTemplate.find({});
    expect(templates).toHaveLength(5);

    for (const template of templates) {
      const validation = validateDefinition(template.definition as any);
      expect(validation.valid, `Template ${template.name} failed validation: ${validation.errors?.join(', ')}`).toBe(true);
    }
  });

  it('instantiate creates editable draft for current user', async () => {
    // Fetch any template (e.g., first one)
    const template = await WorkflowTemplate.findOne();
    if (!template) {
      throw new Error('Template not found');
    }

    // Instantiate the template
    const instantiateRes = await request(app)
      .post(`/api/templates/${template._id}/instantiate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(instantiateRes.status).toBe(201);
    expect(instantiateRes.body.workflow).not.toBeNull();
    expect(instantiateRes.body.version).not.toBeNull();

    const workflow = instantiateRes.body.workflow;
    const version = instantiateRes.body.version;

    // Verify workflow properties
    expect(workflow.name).toContain(template.name);
    expect(workflow.description).toBe(template.description);
    expect(workflow.owner.toString()).toBe(adminId);
    expect(workflow.status).toBe('draft');
    expect(workflow.latestVersion).toBe(1);
    expect(workflow.activeVersion).toBeNull();

    // Verify version 1 matches template definition
    const versionDoc = await WorkflowVersion.findById(version._id);
    expect(versionDoc).not.toBeNull();
    // TypeScript type guard: after null check, versionDoc is definitely not null
    const verifiedVersionDoc = versionDoc!;
    expect(verifiedVersionDoc.version).toBe(1);
    expect(verifiedVersionDoc.definition).toEqual(template.definition);
    expect(verifiedVersionDoc.createdBy.toString()).toBe(adminId);

    // Verify the workflow is editable (i.e., we can update its name)
    const updateRes = await request(app)
      .patch(`/api/workflows/${workflow._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Template Workflow' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.workflow.name).toBe('Updated Template Workflow');
  });
});
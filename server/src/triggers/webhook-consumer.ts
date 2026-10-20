import express, { Request, Response, NextFunction } from 'express';
import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { getConnection } from '../queues';
import Workflow from '../models/Workflow';
import WorkflowVersion from '../models/WorkflowVersion';
import WorkflowRun from '../models/WorkflowRun';
import { enqueueRun } from '../queues';
import { logAudit } from '../services/audit.service';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import crypto from 'crypto';

dayjs.extend(utc);
dayjs.extend(timezone);

// In-memory store for rate limiting (in production, use Redis)
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};

/**
 * WebhookConsumer handles incoming webhook requests, validates them,
 * and creates workflow runs for matching webhook triggers.
 */
export class WebhookConsumer {
  private app: express.Application;
  private worker: Worker | null = null;
  private readonly rateLimitWindowMs = 60000; // 1 minute window
  private readonly maxRequestsPerWindow = 100; // Default rate limit

  constructor() {
    this.app = express();
    this.app.use(express.json({ limit: '1mb' })); // Limit JSON body size
    this.setupRoutes();
  }

  /**
   * Start the webhook consumer.
   * @returns Promise that resolves when the consumer is started
   */
  async start(): Promise<void> {
    const conn = getConnection();
    if (!conn) {
      console.warn('[webhook-consumer] REDIS_URL is not set — webhook consumer not started');
      return;
    }

    this.worker = new Worker(
      'webhook-triggers',
      async (job: { data: WebhookJobData }) => {
        if (job.data.webhookId && job.data.eventData) {
          await this.processWebhookTrigger(job.data.webhookId, job.data.eventData);
        }
      },
      { connection: conn }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[webhook-consumer] job ${job?.id ?? '?'} failed: ${err.message}`);
    });

    console.log('[webhook-consumer] webhook consumer started');
  }

  /**
   * Stop the webhook consumer.
   * @returns Promise that resolves when the consumer is stopped
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[webhook-consumer] webhook consumer stopped');
    }
  }

  /**
   * Get the Express app for mounting routes.
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Setup HTTP routes for receiving webhook requests.
   */
  private setupRoutes(): void {
    // Webhook endpoint - expects webhookId as a parameter
    this.app.post('/webhook/:webhookId', this.handleWebhookRequest.bind(this));
  }

  /**
   * Handle incoming webhook request.
   * Validates token, HMAC signature, and rate limit before processing.
   */
  private async handleWebhookRequest(req: Request, res: Response): Promise<void> {
    try {
      const webhookId = req.params.webhookId;

      if (!webhookId) {
        res.status(400).json({ error: 'Webhook ID is required' });
        return;
      }

      // Get webhook configuration from workflows
      const webhookConfig = await this.getWebhookConfig(webhookId);
      if (!webhookConfig) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      // Validate rate limit
      if (!this.checkRateLimit(webhookId, webhookConfig.rateLimit)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Validate token if configured
      if (webhookConfig.token && !this.validateToken(req, webhookConfig.token)) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      // Validate HMAC signature if configured
      if (webhookConfig.hmacSecret && !this.validateHmacSignature(req, webhookConfig.hmacSecret)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Extract event data from request
      const eventData = this.extractEventData(req, webhookConfig);

      // Enqueue job for processing (to avoid blocking HTTP request)
      if (this.worker) {
        await this.worker.add('process-webhook', {
          webhookId,
          eventData
        });
      }

      res.status(202).json({ message: 'Webhook accepted for processing' });
    } catch (error) {
      console.error('[webhook-consumer] Error handling webhook request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get webhook configuration for a given webhook ID.
   * Looks through all active workflows to find webhook trigger configurations.
   */
  private async getWebhookConfig(webhookId: string): Promise<any> {
    try {
      // Find all active workflows
      const workflows = await Workflow.find({ status: 'active' });

      for (const workflow of workflows) {
        // Get the active version of this workflow
        const version = await WorkflowVersion.findOne({
          workflow: workflow._id,
          version: workflow.activeVersion,
        });

        if (!version) continue;

        // Check if this version has a webhook trigger matching the webhookId
        const webhookTrigger = version.definition.nodes.find(
          (node: any) =>
            node.type === 'trigger.webhook' &&
            node.config.webhookId === webhookId
        );

        if (webhookTrigger) {
          // Return the webhook configuration from the trigger
          return {
            token: webhookTrigger.config.token,
            hmacSecret: webhookTrigger.config.hmacSecret,
            rateLimit: webhookTrigger.config.rateLimit ?? 100,
            rateLimitWindow: webhookTrigger.config.rateLimitWindow ?? 60,
            verifySignature: webhookTrigger.config.verifySignature ?? true,
            allowedIps: webhookTrigger.config.allowedIps,
            webhookId: webhookTrigger.config.webhookId || webhookId,
          };
        }
      }

      // Webhook ID not found in any active workflow
      return null;
    } catch (error) {
      console.error('[webhook-consumer] Error getting webhook config:', error);
      return null;
    }
  }

  /**
   * Check if the request is within rate limits.
   */
  private checkRateLimit(webhookId: string, limit: number): boolean {
    const now = Date.now();
    const windowStart = now - this.rateLimitWindowMs;

    // Clean old entries
    for (const key in rateLimitStore) {
      if (rateLimitStore[key].resetTime < windowStart) {
        delete rateLimitStore[key];
      }
    }

    const entry = rateLimitStore[webhookId] || { count: 0, resetTime: now };

    // Reset counter if window has passed
    if (entry.resetTime < windowStart) {
      entry.count = 0;
      entry.resetTime = now;
    }

    // Check if limit exceeded
    if (entry.count >= limit) {
      return false;
    }

    // Increment counter
    entry.count++;
    rateLimitStore[webhookId] = entry;
    return true;
  }

  /**
   * Validate token from request headers or query params.
   */
  private validateToken(req: Request, token: string): boolean {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const providedToken = authHeader.substring(7);
      return providedToken === token;
    }

    // Check query parameter
    if (req.query.token && String(req.query.token) === token) {
      return true;
    }

    // Check custom header (X-Webhook-Token)
    if (req.headers['x-webhook-token'] && String(req.headers['x-webhook-token']) === token) {
      return true;
    }

    return false;
  }

  /**
   * Validate HMAC signature from request headers.
   * Expects signature in format: 'sha256=hex encoded hash'
   */
  private validateHmacSignature(req: Request, secret: string): boolean {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-signature'];
    if (!signature) {
      // If no signature configured, skip validation
      return !secret; // If secret is configured but no signature provided, fail
    }

    // Get raw body for HMAC calculation
    // Note: express.json() middleware parses the body, so we need to
    // reconstruct it or use a different approach for raw body validation
    // For simplicity, we'll use the JSON stringified body
    const body = JSON.stringify(req.body);

    const expectedHash = crypto.createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    // Compare signatures in constant time to prevent timing attacks
    const providedHash = signature.startsWith('sha256=')
      ? signature.substring(7)
      : signature;

    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(providedHash, 'hex')
    );
  }

  /**
   * Extract event data from the webhook request.
   * This can be customized based on webhook configuration.
   */
  private extractEventData(req: Request, webhookConfig: any): Record<string, unknown> {
    // Default: use the entire request body as payload
    // Could be customized to extract specific fields based on config
    return {
      ...req.body,
      headers: req.headers,
      query: req.query,
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process a webhook trigger by finding matching workflows and creating runs.
   * Similar to how EventConsumer.processEvent works.
   */
  private async processWebhookTrigger(
    webhookId: string,
    eventData: Record<string, unknown>
  ): Promise<void> {
    try {
      // Find all workflows that have an active webhook trigger with this webhookId
      const workflows = await Workflow.find({ status: 'active' });

      const processedWorkflows = new Set<string>();

      for (const workflow of workflows) {
        const workflowKey = `${workflow._id}-${webhookId}`;
        if (processedWorkflows.has(workflowKey)) {
          continue;
        }

        try {
          // Get the active version of this workflow
          const version = await WorkflowVersion.findOne({
            workflow: workflow._id,
            version: workflow.activeVersion,
          });

          if (!version) continue;

          // Check if this version has a webhook trigger matching the webhookId
          const hasMatchingTrigger = version.definition.nodes.some(
            (node: any) =>
              node.type === 'trigger.webhook' &&
              node.config.webhookId === webhookId
          );

          if (!hasMatchingTrigger) continue;

          // Create a workflow run for this webhook trigger
          await this.createWebhookTriggeredRun(workflow, version, webhookId, eventData);

          processedWorkflows.add(workflowKey);
        } catch (error) {
          console.error(`[webhook-consumer] Error processing webhook for workflow ${workflow._id}:`, error);
        }
      }
    } catch (error) {
      console.error('[webhook-consumer] Error in processWebhookTrigger:', error);
    }
  }

  /**
   * Create a workflow run for a webhook trigger.
   */
  private async createWebhookTriggeredRun(
    workflow: mongoose.Document & mongoose.Schema.Types.ObjectId & any,
    version: mongoose.Document & mongoose.Schema.Types.ObjectId & any,
    webhookId: string,
    eventData: Record<string, unknown>
  ): Promise<void> {
    try {
      // Create the workflow run
      const run = new WorkflowRun({
        workflow: workflow._id,
        workflowVersion: version._id,
        status: 'queued',
        trigger: {
          type: 'webhook',
          webhookId,
          ...eventData
        },
        idempotencyKey: randomUUID(),
        createdBy: workflow.owner.toString(), // Webhook runs are owned by the workflow owner
      });

      await run.save();

      // Log the audit
      await logAudit(
        workflow.owner.toString(),
        'WEBHOOK_TRIGGER',
        'Workflow',
        workflow._id,
        {
          runId: String(run._id),
          webhookId,
        }
      );

      // Enqueue the run for execution
      await enqueueRun(String(run._id));

      console.log(`[webhook-consumer] Triggered workflow ${workflow._id} via webhook ${webhookId}`);
    } catch (error) {
      console.error(`[webhook-consumer] Error creating webhook triggered run for workflow ${workflow._id}:`, error);
    }
  }
}

/**
 * Start the webhook consumer instance.
 * @returns The started WebhookConsumer instance
 */
export async function startWebhookConsumer(): Promise<WebhookConsumer> {
  const consumer = new WebhookConsumer();
  await consumer.start();
  return consumer;
}

// Export types for use in other modules
export interface WebhookJobData {
  type: 'process-webhook';
  webhookId: string;
  eventData: Record<string, unknown>;
}
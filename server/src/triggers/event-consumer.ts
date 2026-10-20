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

dayjs.extend(utc);
dayjs.extend(timezone);

interface EventJobData {
  eventName: string;
  eventId: string;
  payload: Record<string, unknown>;
}

/**
 * EventConsumer processes events from the events queue and creates workflow runs
 * for workflows that have matching event triggers.
 */
export class EventConsumer {
  private worker: Worker | null = null;

  /**
   * Start the event consumer.
   * @returns Promise that resolves when the consumer is started
   */
  async start(): Promise<void> {
    const conn = getConnection();
    if (!conn) {
      console.warn('[event-consumer] REDIS_URL is not set — event consumer not started');
      return;
    }

    this.worker = new Worker(
      'events',
      async (job: { data: EventJobData }) => {
        if (job.data.eventName && job.data.eventId) {
          await this.processEvent(job.data.eventName, job.data.eventId, job.data.payload);
        }
      },
      { connection: conn }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[event-consumer] job ${job?.id ?? '?'} failed: ${err.message}`);
    });

    console.log('[event-consumer] event consumer started');
  }

  /**
   * Stop the event consumer.
   * @returns Promise that resolves when the consumer is stopped
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[event-consumer] event consumer stopped');
    }
  }

  /**
   * Process an event by finding matching workflows and creating runs for them.
   * @param eventName - The name of the event that occurred
   * @param eventId - Unique identifier for this event occurrence (for idempotency)
   * @param payload - The data associated with the event
   */
  private async processEvent(
    eventName: string,
    eventId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Find all workflows that have an event trigger matching this eventName
      // We'll need to check the active version of each workflow to see if it has
      // a trigger.event node with matching eventName

      // For efficiency, we could maintain a lookup or index, but for now we'll
      // check workflows that are active
      const workflows = await Workflow.find({ status: 'active' });

      const processedWorkflows = new Set<string>(); // Track which workflows we've processed for this event

      for (const workflow of workflows) {
        // Skip if we've already processed this workflow for this event (idempotency at workflow level)
        const workflowKey = `${workflow._id}-${eventId}`;
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

          // Check if this version has an event trigger matching the eventName
          const hasMatchingTrigger = (version.definition as { nodes: any[] }).nodes.some(
            (node: any) =>
              node.type === 'trigger.event' &&
              node.config.eventName === eventName
          );

          if (!hasMatchingTrigger) continue;

          // Check if we've already processed this exact event for this workflow
          // In a real implementation, we would check a database of processed events
          // For now, we'll rely on the jobId uniqueness in the queue to prevent duplicates

          // Create a workflow run for this event trigger
          await this.createEventTriggeredRun(workflow, version, eventName, eventId, payload);

          processedWorkflows.add(workflowKey);
        } catch (error) {
          console.error(`[event-consumer] Error processing event for workflow ${workflow._id}:`, error);
        }
      }
    } catch (error) {
      console.error('[event-consumer] Error in processEvent:', error);
    }
  }

  /**
   * Create a workflow run for an event trigger.
   * @param workflow - The workflow to run
   * @param version - The active version of the workflow
   * @param eventName - The name of the triggering event
   * @param eventId - Unique identifier for this event occurrence
   * @param payload - The data associated with the event
   */
  private async createEventTriggeredRun(
    workflow: mongoose.Document & mongoose.Schema.Types.ObjectId & any,
    version: mongoose.Document & mongoose.Schema.Types.ObjectId & any,
    eventName: string,
    eventId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Create the workflow run
      const run = new WorkflowRun({
        workflow: workflow._id,
        workflowVersion: version.version,
        status: 'queued',
        trigger: {
          type: 'event',
          eventName,
          eventId,
          payload
        },
        idempotencyKey: randomUUID(),
        createdBy: workflow.owner.toString(), // Event runs are owned by the workflow owner
      });

      await run.save();

      // Log the audit
      await logAudit(
        workflow.owner.toString(),
        'EVENT_TRIGGER',
        'Workflow',
        workflow._id,
        {
          runId: String(run._id),
          eventName,
          eventId,
        }
      );

      // Enqueue the run for execution
      await enqueueRun(String(run._id));

      console.log(`[event-consumer] Triggered workflow ${workflow._id} via event ${eventName}`);
    } catch (error) {
      console.error(`[event-consumer] Error creating event triggered run for workflow ${workflow._id}:`, error);
    }
  }
}

/**
 * Start the event consumer instance.
 * @returns The started EventConsumer instance
 */
export async function startEventConsumer(): Promise<EventConsumer> {
  const consumer = new EventConsumer();
  await consumer.start();
  return consumer;
}
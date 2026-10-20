import { Worker, Queue } from 'bullmq';
import mongoose from 'mongoose';
import { getConnection } from '../queues';
import WorkflowSchedule from '../models/WorkflowSchedule';
import Workflow from '../models/Workflow';
import WorkflowVersion from '../models/WorkflowVersion';
import WorkflowRun from '../models/WorkflowRun';
import { enqueueRun } from '../queues';
import { logAudit } from '../services/audit.service';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import CronParser from 'cron-parser';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

interface ScheduleJobData {
  type: 'scheduler-tick';
}

/**
 * SchedulerService handles checking for scheduled workflows that are due to run
 * and creates workflow runs for them.
 */
export class SchedulerService {
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private readonly intervalMs = 60000; // Check every minute

  /**
   * Start the scheduler service.
   * @returns Promise that resolves when the service is started
   */
  async start(): Promise<void> {
    const conn = getConnection();
    if (!conn) {
      console.warn('[scheduler] REDIS_URL is not set — scheduler service not started');
      return;
    }

    this.worker = new Worker(
      'scheduler',
      async (job: { data: ScheduleJobData }) => {
        if (job.data.type === 'scheduler-tick') {
          await this.processDueSchedules();
        }
      },
      { connection: conn }
    );

    // Repeatable tick jobs live on the queue — Worker only consumes, Queue adds
    this.queue = new Queue('scheduler', { connection: conn });
    await this.queue.add(
      'scheduler-tick',
      { type: 'scheduler-tick' },
      {
        repeat: {
          every: this.intervalMs,
        },
        jobId: 'scheduler-tick',
      }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[scheduler] job ${job?.id ?? '?'} failed: ${err.message}`);
    });

    console.log('[scheduler] scheduler service started');
  }

  /**
   * Stop the scheduler service.
   * @returns Promise that resolves when the service is stopped
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[scheduler] scheduler service stopped');
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  /**
   * Process all schedules that are due to run.
   * @returns Promise that resolves when processing is complete
   */
  private async processDueSchedules(): Promise<void> {
    try {
      // Get all enabled schedules
      const schedules = await WorkflowSchedule.find({ enabled: true });
      const now = dayjs();

      for (const schedule of schedules) {
        try {
          const workflow = await Workflow.findById(schedule.workflow);
          if (!workflow) {
            console.warn(`[scheduler] Workflow not found for schedule ${schedule._id}`);
            continue;
          }

          // Check if workflow is active and has an active version
          if (workflow.status !== 'active' || workflow.activeVersion == null) {
            continue;
          }

          const activeVersion = await WorkflowVersion.findOne({
            workflow: schedule.workflow,
            version: workflow.activeVersion,
          });
          if (!activeVersion) {
            continue;
          }

          // Check if this schedule should run now
          if (await this.shouldRunSchedule(schedule, now)) {
            await this.executeScheduledWorkflow(workflow, activeVersion, schedule);
          }
        } catch (error) {
          console.error(`[scheduler] Error processing schedule ${schedule._id}:`, error);
        }
      }
    } catch (error) {
      console.error('[scheduler] Error in processDueSchedules:', error);
    }
  }

  /**
   * Check if a schedule should run at the given time.
   * @param schedule - The schedule to check
   * @param now - The current time
   * @returns True if the schedule should run now
   */
  private async shouldRunSchedule(
    schedule: mongoose.Document & mongoose.Schema.Types.ObjectId & any,
    now: dayjs.Dayjs | Date
  ): Promise<boolean> {
    // Callers (and tests) may pass a raw Date — coerce before plugin methods.
    const nowD = dayjs.isDayjs(now) ? now : dayjs(now);
    // Handle 'once' schedules - they should run at their nextRunAt time
    if (schedule.type === 'once') {
      if (!schedule.nextRunAt) return false;
      const nextRunAt = dayjs(schedule.nextRunAt);
      return nextRunAt.isSameOrBefore(nowD, 'minute');
    }

    // For repeating schedules, check if it's time based on the schedule type
    const nextRunAt = schedule.nextRunAt ? dayjs(schedule.nextRunAt) : null;

    switch (schedule.type) {
      case 'hourly':
        return this.shouldRunHourly(schedule, nowD, nextRunAt);
      case 'daily':
        return this.shouldRunDaily(schedule, nowD, nextRunAt);
      case 'weekly':
        return this.shouldRunWeekly(schedule, nowD, nextRunAt);
      case 'monthly':
        return this.shouldRunMonthly(schedule, nowD, nextRunAt);
      case 'cron':
        return this.shouldRunCron(schedule, nowD, nextRunAt);
      default:
        return false;
    }
  }

  /**
   * Check if an hourly schedule should run.
   */
  private shouldRunHourly(
    schedule: any,
    now: dayjs.Dayjs,
    nextRunAt: dayjs.Dayjs | null
  ): boolean {
    if (!nextRunAt) return true; // First run
    return now.isSameOrAfter(nextRunAt, 'hour');
  }

  /**
   * Check if a daily schedule should run.
   */
  private shouldRunDaily(
    schedule: any,
    now: dayjs.Dayjs,
    nextRunAt: dayjs.Dayjs | null
  ): boolean {
    if (!nextRunAt) return true; // First run
    return now.isSameOrAfter(nextRunAt, 'day');
  }

  /**
   * Check if a weekly schedule should run.
   */
  private shouldRunWeekly(
    schedule: any,
    now: dayjs.Dayjs,
    nextRunAt: dayjs.Dayjs | null
  ): boolean {
    if (!nextRunAt) return true; // First run
    return now.isSameOrAfter(nextRunAt, 'week');
  }

  /**
   * Check if a monthly schedule should run.
   */
  private shouldRunMonthly(
    schedule: any,
    now: dayjs.Dayjs,
    nextRunAt: dayjs.Dayjs | null
  ): boolean {
    if (!nextRunAt) return true; // First run
    return now.isSameOrAfter(nextRunAt, 'month');
  }

  /**
   * Check if a cron schedule should run.
   */
  private async shouldRunCron(
    schedule: any,
    now: dayjs.Dayjs,
    nextRunAt: dayjs.Dayjs | null
  ): Promise<boolean> {
    if (!schedule.cron) return false;

    try {
      // If we have a nextRunAt, check if it's time to run based on that
      if (nextRunAt) {
        return now.isSameOrAfter(nextRunAt, 'minute');
      }

      // Otherwise, parse the cron expression and see if it matches now
      // We need to consider the timezone
      const tz = schedule.timezone || 'UTC';
      const nowInTz = now.tz(tz);
      const interval = CronParser.parseExpression(schedule.cron, {
        tz,
        currentDate: nowInTz.toDate(),
      });

      const nextRun = interval.next();
      const nextRunDayjs = dayjs(nextRun.toDate()).tz(tz);

      // If we've never run before, or if it's time to run based on the cron expression
      return !nextRunAt || nowInTz.isSameOrAfter(nextRunDayjs, 'minute');
    } catch (error) {
      console.error(`[scheduler] Invalid cron expression for schedule ${schedule._id}:`, error);
      return false;
    }
  }

  /**
   * Execute a scheduled workflow by creating a run and enqueuing it.
   * @param workflow - The workflow to run
   * @param version - The active version of the workflow
   * @param schedule - The schedule that triggered this run
   */
  private async executeScheduledWorkflow(
    workflow: mongoose.Document & mongoose.Schema.Types.ObjectId & any,
    version: mongoose.Document & mongoose.Schema.Types.ObjectId & any,
    schedule: any
  ): Promise<void> {
    try {
      // Create the workflow run
      const run = new WorkflowRun({
        workflow: workflow._id,
        workflowVersion: version.version,
        status: 'queued',
        trigger: {
          type: 'schedule',
          scheduleId: schedule._id.toString(),
          scheduleType: schedule.type,
        },
        idempotencyKey: randomUUID(),
        createdBy: workflow.owner.toString(), // Schedule runs are owned by the workflow owner
      });

      await run.save();

      // Update the schedule's nextRunAt time
      await this.updateScheduleNextRunAt(schedule, schedule.type);

      // For 'once' schedules, disable them after running
      if (schedule.type === 'once') {
        schedule.enabled = false;
        await schedule.save();
      }

      // Log the audit
      await logAudit(
        workflow.owner.toString(),
        'SCHEDULE_TRIGGER',
        'Workflow',
        workflow._id,
        {
          runId: String(run._id),
          scheduleId: schedule._id.toString(),
        }
      );

      // Enqueue the run for execution
      await enqueueRun(String(run._id));

      console.log(`[scheduler] Triggered workflow ${workflow._id} via schedule ${schedule._id}`);
    } catch (error) {
      console.error(`[scheduler] Error executing scheduled workflow ${workflow._id}:`, error);
    }
  }

  /**
   * Update the nextRunAt time for a schedule after it has run.
   * @param schedule - The schedule to update
   * @param type - The schedule type
   */
  private async updateScheduleNextRunAt(
    schedule: any,
    type: string
  ): Promise<void> {
    const now = dayjs();
    let nextRunAt: dayjs.Dayjs | null = null;

    switch (type) {
      case 'once':
        // For 'once' schedules, we don't set nextRunAt as they are disabled after running
        break;
      case 'hourly':
        nextRunAt = now.add(1, 'hour');
        break;
      case 'daily':
        nextRunAt = now.add(1, 'day');
        break;
      case 'weekly':
        nextRunAt = now.add(1, 'week');
        break;
      case 'monthly':
        nextRunAt = now.add(1, 'month');
        break;
      case 'cron':
        if (schedule.cron) {
          const tz = schedule.timezone || 'UTC';
          const nowInTz = now.tz(tz);
          try {
            const interval = CronParser.parseExpression(schedule.cron, {
              tz,
              currentDate: nowInTz.toDate(),
            });
            const nextRun = interval.next();
            nextRunAt = dayjs(nextRun.toDate()).tz(tz);
          } catch (error) {
            console.error(`[scheduler] Error calculating next run for cron schedule ${schedule._id}:`, error);
          }
        }
        break;
    }

    if (nextRunAt) {
      schedule.nextRunAt = nextRunAt.toDate();
      await schedule.save();
    }
  }
}

/**
 * Start the scheduler service instance.
 * @returns The started SchedulerService instance
 */
export async function startSchedulerService(): Promise<SchedulerService> {
  const service = new SchedulerService();
  await service.start();
  return service;
}
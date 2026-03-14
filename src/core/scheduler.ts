import { Logger } from '../utils/logger.js';
import { eventBus, SystemEvents } from './eventBus.js';

export type ScheduledTaskHandler = () => void | Promise<void>;

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  handler: ScheduledTaskHandler;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  failureCount: number;
}

export class Scheduler {
  private logger: Logger;
  private tasks: Map<string, ScheduledTask>;
  private intervals: Map<string, NodeJS.Timeout>;
  private taskCounter: number;
  private dynamicImport: typeof import('node-cron') | null;

  constructor() {
    this.logger = new Logger('Scheduler');
    this.tasks = new Map();
    this.intervals = new Map();
    this.taskCounter = 0;
    this.dynamicImport = null;
  }

  private async getCron(): Promise<typeof import('node-cron')> {
    if (!this.dynamicImport) {
      this.dynamicImport = await import('node-cron');
    }
    return this.dynamicImport;
  }

  async schedule(name: string, cronExpression: string, handler: ScheduledTaskHandler): Promise<string> {
    const id = `sched_${++this.taskCounter}_${Date.now()}`;
    
    const task: ScheduledTask = {
      id,
      name,
      cronExpression,
      handler,
      enabled: true,
      runCount: 0,
      failureCount: 0,
    };

    this.tasks.set(id, task);
    await this.startTask(task);
    
    this.logger.info(`Scheduled task '${name}' with cron: ${cronExpression}`);
    eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'scheduled', task: { id, name, cronExpression } });
    
    return id;
  }

  async scheduleInterval(name: string, intervalMs: number, handler: ScheduledTaskHandler): Promise<string> {
    const id = `sched_${++this.taskCounter}_${Date.now()}`;
    
    const task: ScheduledTask = {
      id,
      name,
      cronExpression: `interval:${intervalMs}`,
      handler,
      enabled: true,
      runCount: 0,
      failureCount: 0,
    };

    this.tasks.set(id, task);
    
    const interval = setInterval(async () => {
      if (task.enabled) {
        await this.runTask(task);
      }
    }, intervalMs);
    
    this.intervals.set(id, interval);
    
    this.logger.info(`Scheduled task '${name}' with interval: ${intervalMs}ms`);
    eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'scheduled', task: { id, name, intervalMs } });
    
    return id;
  }

  unschedule(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return false;
    }

    task.enabled = false;
    
    if (this.intervals.has(taskId)) {
      clearInterval(this.intervals.get(taskId)!);
      this.intervals.delete(taskId);
    }

    this.tasks.delete(taskId);
    this.logger.info(`Unscheduled task '${task.name}'`);
    eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'unscheduled', task: { id: taskId, name: task.name } });
    
    return true;
  }

  enable(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    task.enabled = true;
    this.logger.info(`Enabled task '${task.name}'`);
    return true;
  }

  disable(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    task.enabled = false;
    this.logger.info(`Disabled task '${task.name}'`);
    return true;
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getStatus(): { total: number; enabled: number; disabled: number; totalRuns: number } {
    let enabled = 0, disabled = 0, totalRuns = 0;
    
    for (const task of this.tasks.values()) {
      if (task.enabled) enabled++;
      else disabled++;
      totalRuns += task.runCount;
    }

    return {
      total: this.tasks.size,
      enabled,
      disabled,
      totalRuns,
    };
  }

  private async startTask(task: ScheduledTask): Promise<void> {
    const cron = await this.getCron();
    
    const scheduled = cron.schedule(task.cronExpression, async () => {
      if (task.enabled) {
        await this.runTask(task);
      }
    });

    (task as unknown as { _scheduler: typeof scheduled })._scheduler = scheduled;
  }

  private async runTask(task: ScheduledTask): Promise<void> {
    task.lastRun = new Date();
    
    this.logger.info(`Running scheduled task '${task.name}'`);
    
    try {
      await task.handler();
      task.runCount++;
      this.logger.info(`Task '${task.name}' completed successfully`);
      eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'executed', task: { id: task.id, name: task.name, success: true } });
    } catch (error) {
      task.failureCount++;
      this.logger.error(`Task '${task.name}' failed: ${(error as Error).message}`);
      eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'executed', task: { id: task.id, name: task.name, success: false, error: (error as Error).message } });
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down scheduler...');
    
    for (const [id, interval] of this.intervals.entries()) {
      clearInterval(interval);
    }
    this.intervals.clear();

    for (const task of this.tasks.values()) {
      task.enabled = false;
      if ((task as unknown as { _scheduler?: { stop: () => void } })._scheduler) {
        (task as unknown as { _scheduler: { stop: () => void } })._scheduler.stop();
      }
    }

    this.tasks.clear();
    this.logger.info('Scheduler shut down');
  }
}

export const scheduler = new Scheduler();

export const SystemSchedules = {
  HEALTH_CHECK: 'health-check',
  MEMORY_OPTIMIZATION: 'memory-optimization',
  SESSION_CLEANUP: 'session-cleanup',
  STATS_LOGGING: 'stats-logging',
} as const;

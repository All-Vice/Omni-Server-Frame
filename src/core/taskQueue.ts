import { Logger } from '../utils/logger.js';
import { eventBus, SystemEvents } from './eventBus.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Task<T = unknown> {
  id: string;
  name: string;
  payload: T;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  retries: number;
  maxRetries: number;
}

export type TaskHandler<T = unknown, R = unknown> = (task: Task<T>) => Promise<R>;

export interface TaskQueueOptions {
  concurrency?: number;
  defaultMaxRetries?: number;
}

export class TaskQueue {
  private logger: Logger;
  private tasks: Map<string, Task>;
  private queue: Task[];
  private running: number;
  private concurrency: number;
  private defaultMaxRetries: number;
  private handlers: Map<string, TaskHandler>;
  private taskCounter: number;

  constructor(options: TaskQueueOptions = {}) {
    this.logger = new Logger('TaskQueue');
    this.tasks = new Map();
    this.queue = [];
    this.running = 0;
    this.concurrency = options.concurrency || 5;
    this.defaultMaxRetries = options.defaultMaxRetries || 3;
    this.handlers = new Map();
    this.taskCounter = 0;
  }

  registerHandler(name: string, handler: TaskHandler): void {
    this.handlers.set(name, handler);
    this.logger.info(`Registered handler for task type '${name}'`);
  }

  async enqueue<T>(name: string, payload: T, priority: TaskPriority = 'normal'): Promise<string> {
    const id = `task_${++this.taskCounter}_${Date.now()}`;
    
    const task: Task<T> = {
      id,
      name,
      payload,
      priority,
      status: 'pending',
      createdAt: new Date(),
      retries: 0,
      maxRetries: this.defaultMaxRetries,
    };

    this.tasks.set(id, task);
    this.queue.push(task);
    this.queue.sort((a, b) => this.priorityValue(b.priority) - this.priorityValue(a.priority));

    this.logger.info(`Enqueued task ${id} (${name}) with priority ${priority}`);
    eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'enqueued', task });

    this.processQueue();
    return id;
  }

  async cancel(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return false;
    }

    if (task.status === 'running') {
      task.status = 'cancelled';
      this.logger.warn(`Task ${taskId} is running, marked as cancelled`);
      return false;
    }

    task.status = 'cancelled';
    this.queue = this.queue.filter(t => t.id !== taskId);
    this.logger.info(`Cancelled task ${taskId}`);
    eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'cancelled', task });
    return true;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getQueueStatus(): { pending: number; running: number; completed: number; failed: number } {
    let pending = 0, running = 0, completed = 0, failed = 0;
    
    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'pending': pending++; break;
        case 'running': running++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
      }
    }

    return { pending, running, completed, failed };
  }

  private priorityValue(priority: TaskPriority): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'normal': return 2;
      case 'low': return 1;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.running >= this.concurrency) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift();
    if (!task || task.status === 'cancelled') {
      this.processQueue();
      return;
    }

    this.running++;
    task.status = 'running';
    task.startedAt = new Date();

    this.logger.info(`Starting task ${task.id} (${task.name})`);

    try {
      const handler = this.handlers.get(task.name);
      if (!handler) {
        throw new Error(`No handler registered for task type '${task.name}'`);
      }

      const result = await handler(task);
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;

      this.logger.info(`Task ${task.id} completed successfully`);
      eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'completed', task });

    } catch (error) {
      task.error = (error as Error).message;
      
      if (task.retries < task.maxRetries) {
        task.retries++;
        task.status = 'pending';
        this.queue.push(task);
        this.queue.sort((a, b) => this.priorityValue(b.priority) - this.priorityValue(a.priority));
        
        this.logger.warn(`Task ${task.id} failed, retry ${task.retries}/${task.maxRetries}`);
        eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'retry', task });
      } else {
        task.status = 'failed';
        task.completedAt = new Date();
        
        this.logger.error(`Task ${task.id} failed permanently: ${task.error}`);
        eventBus.publish(SystemEvents.SCHEDULER_TASK, { type: 'failed', task });
      }
    }

    this.running--;
    this.processQueue();
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down task queue...');
    
    const runningTasks = Array.from(this.tasks.values()).filter(t => t.status === 'running');
    if (runningTasks.length > 0) {
      this.logger.warn(`Waiting for ${runningTasks.length} running tasks to complete...`);
      await Promise.all(runningTasks.map(t => new Promise(resolve => {
        const check = setInterval(() => {
          if (t.status !== 'running') {
            clearInterval(check);
            resolve(true);
          }
        }, 100);
      })));
    }

    this.queue = [];
    this.logger.info('Task queue shut down');
  }
}

export const taskQueue = new TaskQueue({ concurrency: 5, defaultMaxRetries: 3 });

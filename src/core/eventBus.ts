import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

export type EventHandler = (data: unknown) => void | Promise<void>;

export interface EventSubscription {
  event: string;
  handler: EventHandler;
  id: string;
}

export class EventBus extends EventEmitter {
  private logger: Logger;
  private subscriptions: Map<string, Set<EventSubscription>>;
  private subscriptionCounter: number;

  constructor() {
    super();
    this.logger = new Logger('EventBus');
    this.subscriptions = new Map();
    this.subscriptionCounter = 0;
  }

  subscribe(event: string, handler: EventHandler): string {
    const id = `sub_${++this.subscriptionCounter}`;
    
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }

    const subscription: EventSubscription = { event, handler, id };
    this.subscriptions.get(event)!.add(subscription);

    this.on(event, handler);
    this.logger.debug(`Subscribed to event '${event}' with id ${id}`);

    return id;
  }

  unsubscribe(subscriptionId: string): boolean {
    for (const [event, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        if (sub.id === subscriptionId) {
          this.off(event, sub.handler);
          subs.delete(sub);
          this.logger.debug(`Unsubscribed from event '${event}' with id ${subscriptionId}`);
          return true;
        }
      }
    }
    return false;
  }

  async publish(event: string, data?: unknown): Promise<void> {
    this.logger.debug(`Publishing event '${event}'`);
    this.emit(event, data);
  }

  getSubscribers(event: string): number {
    return this.subscriptions.get(event)?.size || 0;
  }

  clearAll(): void {
    for (const [event, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        this.off(event, sub.handler);
      }
      subs.clear();
    }
    this.subscriptions.clear();
    this.logger.info('All event subscriptions cleared');
  }
}

export const eventBus = new EventBus();

export const SystemEvents = {
  SESSION_CREATED: 'session:created',
  SESSION_ENDED: 'session:ended',
  SESSION_ERROR: 'session:error',
  TOOL_EXECUTED: 'tool:executed',
  GIT_OPERATION: 'git:operation',
  GITHUB_OPERATION: 'github:operation',
  MEMORY_STORED: 'memory:stored',
  MEMORY_RETRIEVED: 'memory:retrieved',
  SCHEDULER_TASK: 'scheduler:task',
  AGENT_POOL_STATUS: 'agent:pool:status',
  SERVER_SHUTDOWN: 'server:shutdown',
  SERVER_READY: 'server:ready',
} as const;

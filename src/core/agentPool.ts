import { Logger } from '../utils/logger.js';
import { eventBus, SystemEvents } from './eventBus.js';
import { SessionManager, SessionInstance } from '../acp/session.js';

export type AgentStatus = 'idle' | 'busy' | 'warming' | 'error';

export interface Agent {
  id: string;
  session: SessionInstance | null;
  status: AgentStatus;
  currentTask?: string;
  tasksCompleted: number;
  tasksFailed: number;
  startedAt: Date;
  lastUsedAt: Date;
}

export interface AgentPoolOptions {
  minAgents?: number;
  maxAgents?: number;
  kiloPath?: string;
}

export class AgentPool {
  private logger: Logger;
  private agents: Map<string, Agent>;
  private sessionManager: SessionManager;
  private minAgents: number;
  private maxAgents: number;
  private kiloPath: string;
  private agentCounter: number;

  constructor(sessionManager: SessionManager, options: AgentPoolOptions = {}) {
    this.logger = new Logger('AgentPool');
    this.sessionManager = sessionManager;
    this.minAgents = options.minAgents || 2;
    this.maxAgents = options.maxAgents || 10;
    this.kiloPath = options.kiloPath || process.env.KILO_PATH || '/home/vincent/.nvm/versions/node/v24.13.1/bin/kilo';
    this.agents = new Map();
    this.agentCounter = 0;
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing agent pool (min: ${this.minAgents}, max: ${this.maxAgents})`);
    
    for (let i = 0; i < this.minAgents; i++) {
      await this.spawnAgent();
    }

    eventBus.publish(SystemEvents.AGENT_POOL_STATUS, { 
      type: 'initialized', 
      activeAgents: this.agents.size 
    });
  }

  async acquire(): Promise<Agent | null> {
    const available = this.getAvailableAgent();
    
    if (available) {
      available.status = 'busy';
      available.lastUsedAt = new Date();
      this.logger.info(`Acquired agent ${available.id} (available pool)`);
      eventBus.publish(SystemEvents.AGENT_POOL_STATUS, { 
        type: 'acquired', 
        agentId: available.id,
        poolSize: this.agents.size 
      });
      return available;
    }

    if (this.agents.size < this.maxAgents) {
      const newAgent = await this.spawnAgent();
      newAgent.status = 'busy';
      newAgent.lastUsedAt = new Date();
      this.logger.info(`Acquired newly spawned agent ${newAgent.id}`);
      eventBus.publish(SystemEvents.AGENT_POOL_STATUS, { 
        type: 'acquired', 
        agentId: newAgent.id,
        poolSize: this.agents.size 
      });
      return newAgent;
    }

    this.logger.warn('Agent pool exhausted, all agents busy');
    return null;
  }

  release(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = 'idle';
    agent.currentTask = undefined;
    agent.lastUsedAt = new Date();
    
    this.logger.info(`Released agent ${agentId}`);
    eventBus.publish(SystemEvents.AGENT_POOL_STATUS, { 
      type: 'released', 
      agentId: agentId,
      poolSize: this.agents.size 
    });
    
    return true;
  }

  async terminate(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (agent.session) {
      await agent.session.terminate();
    }

    this.agents.delete(agentId);
    this.logger.info(`Terminated agent ${agentId}`);
    eventBus.publish(SystemEvents.AGENT_POOL_STATUS, { 
      type: 'terminated', 
      agentId: agentId,
      poolSize: this.agents.size 
    });
    
    return true;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getStatus(): { 
    total: number; 
    idle: number; 
    busy: number; 
    warming: number; 
    error: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
  } {
    let idle = 0, busy = 0, warming = 0, error = 0;
    let totalTasksCompleted = 0, totalTasksFailed = 0;

    for (const agent of this.agents.values()) {
      switch (agent.status) {
        case 'idle': idle++; break;
        case 'busy': busy++; break;
        case 'warming': warming++; break;
        case 'error': error++; break;
      }
      totalTasksCompleted += agent.tasksCompleted;
      totalTasksFailed += agent.tasksFailed;
    }

    return {
      total: this.agents.size,
      idle,
      busy,
      warming,
      error,
      totalTasksCompleted,
      totalTasksFailed,
    };
  }

  private getAvailableAgent(): Agent | null {
    for (const agent of this.agents.values()) {
      if (agent.status === 'idle') {
        return agent;
      }
    }
    return null;
  }

  private async spawnAgent(): Promise<Agent> {
    const id = `agent_${++this.agentCounter}_${Date.now()}`;
    
    const sessionId = await this.sessionManager.createSession();
    const session = this.sessionManager.getSession(sessionId);
    
    if (!session) {
      throw new Error('Failed to create session for agent');
    }
    
    const agent: Agent = {
      id,
      session,
      status: 'idle',
      tasksCompleted: 0,
      tasksFailed: 0,
      startedAt: new Date(),
      lastUsedAt: new Date(),
    };

    this.agents.set(id, agent);
    this.logger.info(`Spawned agent ${id}`);
    
    return agent;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down agent pool...');
    
    for (const agent of this.agents.values()) {
      if (agent.session) {
        await agent.session.terminate();
      }
    }

    this.agents.clear();
    this.logger.info('Agent pool shut down');
  }
}

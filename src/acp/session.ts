import { EventEmitter } from 'events';
import { AcpClient } from './client.js';
import { Logger } from '../utils/logger.js';

export interface Session {
  id: string;
  createdAt: Date;
  status: 'initializing' | 'active' | 'completed' | 'error';
  model?: string;
  mode?: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionInstance>();
  private logger: Logger;

  constructor(private kiloPath: string) {
    this.logger = new Logger('session-manager');
  }

  async createSession(options: { model?: string; mode?: string } = {}): Promise<string> {
    const id = crypto.randomUUID();
    const session = new SessionInstance(id, this.kiloPath, options);
    
    session.on('update', (data) => this.emit(`session:${id}:update`, data));
    session.on('error', (error) => this.emit(`session:${id}:error`, error));
    session.on('end', () => this.sessions.delete(id));

    this.sessions.set(id, session);
    await session.start();
    
    this.logger.info(`Session ${id} created`);
    return id;
  }

  getSession(id: string): SessionInstance | undefined {
    return this.sessions.get(id);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  async shutdown(): Promise<void> {
    this.logger.info(`Shutting down ${this.sessions.size} sessions...`);
    await Promise.all(
      Array.from(this.sessions.values()).map(s => s.terminate())
    );
  }
}

export class SessionInstance extends EventEmitter {
  private client: AcpClient;
  private logger: Logger;
  public status: 'initializing' | 'active' | 'completed' | 'error' = 'initializing';
  public model?: string;
  public mode?: string;

  constructor(
    public id: string,
    kiloPath: string,
    options: { model?: string; mode?: string } = {}
  ) {
    super();
    this.client = new AcpClient(kiloPath);
    this.logger = new Logger(`session:${id}`);
    this.model = options.model;
    this.mode = options.mode;
  }

  async start(): Promise<void> {
    try {
      await this.client.initialize();
      
      const capabilities = await this.client.createSession();
      this.status = 'active';
      
      this.client.on('message', (msg: unknown) => {
        this.handleMessage(msg as Record<string, unknown>);
      });

      if (this.model) {
        await this.client.setModel(this.model);
      }
      if (this.mode) {
        await this.client.setMode(this.mode);
      }

      this.logger.info('Session started');
    } catch (error) {
      this.status = 'error';
      this.logger.error('Failed to start session', error);
      throw error;
    }
  }

  async sendPrompt(content: string): Promise<void> {
    await this.client.sendPrompt(content);
  }

  async cancel(): Promise<void> {
    await this.client.cancel();
  }

  async terminate(): Promise<void> {
    await this.client.terminate();
    this.status = 'completed';
    this.emit('end');
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const method = msg.method as string | undefined;
    const params = msg.params as Record<string, unknown> | undefined;
    
    this.logger.debug('Received message:', JSON.stringify(msg));
    
    if (method === 'session/update' || method === 'AgentMessageChunk' || method === 'agentai.messageChunk') {
      this.emit('update', params);
    } else if (method === 'session/end' || method === 'TurnEnd' || method === 'agentai.turnEnd') {
      this.emit('end', params);
    } else if (method === 'session/error' || method === 'error') {
      this.emit('error', params);
    } else if (method === 'ToolCall' || method === 'tool_call' || method === 'agentai.toolCall') {
      this.emit('tool', params);
    } else if (method === 'session/request_permission' || method === 'agentai.requestPermission') {
      this.emit('permission', params);
    }
  }
}

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

export interface AcpMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
}

export interface AgentCapabilities {
  loadSession?: boolean;
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
  };
}

export interface InitializeResult {
  protocolVersion: number;
  agentCapabilities: AgentCapabilities;
  authMethods?: Array<{ id: string; name: string; description: string }>;
  serverInfo: {
    name: string;
    version: string;
  };
}

export class AcpClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private logger: Logger;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  private sessionId: string | null = null;
  private initialized = false;

  constructor(private kiloPath: string, private port?: number) {
    super();
    this.logger = new Logger('acp-client');
  }

  async initialize(clientCapabilities: ClientCapabilities = {}): Promise<InitializeResult> {
    this.spawnProcess();

    const result = await this.sendRequest<InitializeResult>('initialize', {
      protocolVersion: 1,
      clientCapabilities,
      clientInfo: {
        name: 'omni-server-frame',
        version: '1.0.0'
      }
    });

    this.initialized = true;
    this.logger.info('ACP client initialized');
    return result;
  }

  async createSession(): Promise<string> {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    const result = await this.sendRequest<{ sessionId: string }>('session/new', {
      cwd: process.cwd(),
      mcpServers: []
    });

    this.sessionId = result.sessionId;
    this.logger.info(`Created session: ${this.sessionId}`);
    return this.sessionId;
  }

  async sendPrompt(prompt: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    await this.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }
    });
  }

  async cancel(): Promise<void> {
    if (!this.sessionId) return;

    await this.sendRequest('session/cancel', {
      sessionId: this.sessionId
    });
  }

  async setModel(model: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    await this.sendRequest('session/set_model', {
      sessionId: this.sessionId,
      model
    });
  }

  async setMode(mode: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    await this.sendRequest('session/set_mode', {
      sessionId: this.sessionId,
      mode
    });
  }

  async terminate(): Promise<void> {
    if (this.sessionId) {
      try {
        await this.sendRequest('session/terminate', {
          sessionId: this.sessionId
        });
      } catch {}
    }

    if (this.process) {
      this.process.kill();
      
      // Force kill after 5 seconds if still alive
      const forceKillTimeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
      
      forceKillTimeout.unref();
    }
    this.sessionId = null;
    this.initialized = false;
  }

  private spawnProcess(): void {
    const args = ['acp', '--print-logs'];
    if (this.port) {
      args.push('--port', String(this.port));
    }

    this.process = spawn(this.kiloPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout?.on('data', (data) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data) => {
      const msg = data.toString();
      this.logger.debug('Kilo:', msg);
      this.emit('log', msg);
    });

    this.process.on('exit', (code) => {
      this.logger.info(`Kilo process exited with code ${code}`);
      this.initialized = false;
      this.emit('exit', code);
    });

    this.process.on('error', (err) => {
      this.logger.error('Kilo process error', err);
      this.emit('error', err);
    });
  }

  private handleData(data: string): void {
    const lines = data.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const message: AcpMessage = JSON.parse(line);

        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);

          if (message.error) {
            reject(new Error(`JSON-RPC error: ${message.error.message}`));
          } else {
            resolve(message.result);
          }
        } else if (message.method) {
          this.emit('message', message);
        }
      } catch (e) {
        this.logger.debug('Failed to parse message:', line);
      }
    }
  }

  private sendRequest<T>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('Process not running'));
        return;
      }

      const id = ++this.messageId;
      const request: AcpMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);

      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }

      this.pendingRequests.set(id, { 
        resolve: (result: unknown) => {
          clearTimeout(timeout);
          resolve(result as T);
        }, 
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        } 
      });
      
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }
}

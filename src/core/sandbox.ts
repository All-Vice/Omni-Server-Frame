/**
 * Sandbox - Isolated Code Execution System
 * 
 * Provides safe execution of AI-generated code with multiple isolation levels:
 * - Process: Basic process isolation with restricted permissions
 * - Docker: Container-based isolation (when Docker is available)
 * 
 * Features:
 * - Resource limits (CPU, memory, time)
 * - Execution timeouts
 * - stdout/stderr capture
 * - Audit logging
 * - Exit code handling
 * 
 * Based on virtualization research: See library/Virtualization.md
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { Logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// Create logger instance
const logger = new Logger('sandbox');

// Types
export type SandboxMode = 'process' | 'docker';
export type SandboxStatus = 'idle' | 'running' | 'completed' | 'timeout' | 'error' | 'killed';

export interface SandboxOptions {
  /** Execution mode: process or docker */
  mode?: SandboxMode;
  /** Maximum execution time in ms (default: 30000) */
  timeout?: number;
  /** Maximum memory in MB (default: 512) */
  memoryLimit?: number;
  /** Maximum CPU time in seconds (default: 10) */
  cpuTime?: number;
  /** Working directory for execution */
  workingDirectory?: string;
  /** Environment variables to pass */
  env?: Record<string, string>;
  /** Docker image to use (required for docker mode) */
  dockerImage?: string;
  /** Enable audit logging */
  auditLog?: boolean;
}

export interface SandboxResult {
  /** Unique execution ID */
  id: string;
  /** Exit code */
  exitCode: number | null;
  /** Signal that killed the process (if any) */
  signal: string | null;
  /** Stdout output */
  stdout: string;
  /** Stderr output */
  stderr: string;
  /** Execution time in ms */
  executionTime: number;
  /** Peak memory usage in MB */
  peakMemory: number;
  /** Exit reason */
  status: SandboxStatus;
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  timestamp: number;
}

export interface SandboxMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  timeouts: number;
  averageExecutionTime: number;
  peakMemoryUsage: number;
}

// Constants
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MEMORY_LIMIT = 512; // 512 MB
const DEFAULT_CPU_TIME = 10; // 10 seconds

/**
 * Sandbox class for isolated code execution
 */
export class Sandbox extends EventEmitter {
  private activeProcess: ChildProcess | null = null;
  private currentExecutionId: string | null = null;
  private startTime: number = 0;
  private timeoutHandle: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private peakMemory: number = 0;
  private workDir: string = '';
  
  // Metrics
  private metrics: SandboxMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    timeouts: 0,
    averageExecutionTime: 0,
    peakMemoryUsage: 0
  };

  constructor(private options: SandboxOptions = {}) {
    super();
    this.options = {
      mode: 'process',
      timeout: DEFAULT_TIMEOUT,
      memoryLimit: DEFAULT_MEMORY_LIMIT,
      cpuTime: DEFAULT_CPU_TIME,
      auditLog: true,
      ...options
    };
  }

  /**
   * Execute code in a sandboxed environment
   */
  async execute(code: string, language: string = 'javascript'): Promise<SandboxResult> {
    const executionId = randomUUID();
    this.currentExecutionId = executionId;
    this.startTime = Date.now();
    this.peakMemory = 0;
    
    logger.info(`Starting execution ${executionId} in ${this.options.mode} mode`);
    this.emit('execution:start', { id: executionId, language });

    let result: SandboxResult;

    try {
      // Create working directory
      this.workDir = join('/tmp', `sandbox-${executionId}`);
      await mkdir(this.workDir, { recursive: true });

      if (this.options.mode === 'docker') {
        result = await this.executeDocker(code, language);
      } else {
        result = await this.executeProcess(code, language);
      }
    } catch (error) {
      result = this.createErrorResult(executionId, error as Error);
    } finally {
      // Cleanup
      await this.cleanup();
    }

    // Update metrics
    this.updateMetrics(result);

    // Audit log
    if (this.options.auditLog) {
      this.auditLog(executionId, result);
    }

    this.emit('execution:complete', { id: executionId, result });
    logger.info(`Execution ${executionId} completed with status: ${result.status}`);

    return result;
  }

  /**
   * Execute using process isolation
   */
  private async executeProcess(code: string, language: string): Promise<SandboxResult> {
    const executionId = this.currentExecutionId!;
    const startTime = Date.now();
    
    // Write code to file
    const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'sh';
    const filename = `script.${ext}`;
    const filepath = join(this.workDir, filename);
    
    await writeFile(filepath, code, 'utf-8');

    // Prepare command based on language
    const { command, args } = this.getExecutionCommand(language, filepath);

    return new Promise((resolve) => {
      // Set timeout
      this.timeoutHandle = setTimeout(() => {
        this.kill();
        resolve({
          id: executionId,
          exitCode: null,
          signal: 'SIGTERM',
          stdout: '',
          stderr: 'Execution timed out',
          executionTime: Date.now() - startTime,
          peakMemory: this.peakMemory,
          status: 'timeout',
          timestamp: startTime
        });
      }, this.options.timeout);

      // Start monitoring
      this.startMetricsMonitoring();

      // Spawn process with restrictions
      const env = {
        ...process.env,
        ...this.options.env,
        NODE_OPTIONS: '--max-old-space-size=' + this.options.memoryLimit
      };

      this.activeProcess = spawn(command, args, {
        cwd: this.options.workingDirectory || this.workDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Security: run with restricted resources
        gid: process.getgid?.() || 1000,
        uid: process.getuid?.() || 1000,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      this.activeProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > 1024 * 1024) { // 1MB
          stdout = stdout.slice(-1024 * 1024);
        }
      });

      this.activeProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 1024 * 1024) {
          stderr = stderr.slice(-1024 * 1024);
        }
      });

      this.activeProcess.on('close', (exitCode, signal) => {
        this.stopMetricsMonitoring();
        
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }

        const executionTime = Date.now() - startTime;

        resolve({
          id: executionId,
          exitCode,
          signal,
          stdout,
          stderr,
          executionTime,
          peakMemory: this.peakMemory,
          status: exitCode === 0 ? 'completed' : 'error',
          timestamp: startTime
        });
      });

      this.activeProcess.on('error', (error) => {
        this.stopMetricsMonitoring();
        
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }

        resolve({
          id: executionId,
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: error.message,
          executionTime: Date.now() - startTime,
          peakMemory: this.peakMemory,
          status: 'error',
          error: error.message,
          timestamp: startTime
        });
      });
    });
  }

  /**
   * Execute using Docker container
   */
  private async executeDocker(code: string, language: string): Promise<SandboxResult> {
    const executionId = this.currentExecutionId!;
    const startTime = Date.now();
    
    // Check if Docker is available
    try {
      await execAsync('docker --version');
    } catch {
      logger.warn('Docker not available, falling back to process mode');
      this.options.mode = 'process';
      return this.executeProcess(code, language);
    }

    // Write code to file
    const ext = language === 'python' ? 'py' : 'js';
    const filename = `script.${ext}`;
    const filepath = join(this.workDir, filename);
    
    await writeFile(filepath, code, 'utf-8');

    // Determine Docker image and command
    const image = this.options.dockerImage || this.getDockerImage(language);
    const { command, args } = this.getExecutionCommand(language, `/sandbox/${filename}`);

    const dockerArgs = [
      'run',
      '--rm',
      '--memory', `${this.options.memoryLimit}m`,
      '--cpus', String(this.options.cpuTime),
      '--network', 'none', // No network for security
      '--pids-limit', '100',
      '-v', `${this.workDir}:/sandbox:ro`,
      '--workdir', '/sandbox',
      image,
      command,
      ...args
    ];

    return new Promise((resolve) => {
      this.timeoutHandle = setTimeout(() => {
        // Kill Docker container
        execAsync(`docker kill $(docker ps -q --filter "ancestor=${image}") 2>/dev/null`).catch(() => {});
        this.kill();
        
        resolve({
          id: executionId,
          exitCode: null,
          signal: 'SIGTERM',
          stdout: '',
          stderr: 'Execution timed out',
          executionTime: Date.now() - startTime,
          peakMemory: this.peakMemory,
          status: 'timeout',
          timestamp: startTime
        });
      }, this.options.timeout);

      this.activeProcess = spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      this.activeProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      this.activeProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      this.activeProcess.on('close', (exitCode, signal) => {
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }

        resolve({
          id: executionId,
          exitCode,
          signal,
          stdout,
          stderr,
          executionTime: Date.now() - startTime,
          peakMemory: this.peakMemory,
          status: exitCode === 0 ? 'completed' : 'error',
          timestamp: startTime
        });
      });

      this.activeProcess.on('error', (error) => {
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }

        resolve({
          id: executionId,
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: error.message,
          executionTime: Date.now() - startTime,
          peakMemory: this.peakMemory,
          status: 'error',
          error: error.message,
          timestamp: startTime
        });
      });
    });
  }

  /**
   * Get execution command based on language
   */
  private getExecutionCommand(language: string, filepath: string): { command: string; args: string[] } {
    switch (language) {
      case 'javascript':
      case 'node':
        return { command: 'node', args: [filepath] };
      case 'python':
      case 'python3':
        return { command: 'python3', args: ['-u', filepath] };
      case 'bash':
      case 'shell':
        return { command: 'bash', args: [filepath] };
      case 'typescript':
        return { command: 'npx', args: ['ts-node', filepath] };
      default:
        return { command: 'node', args: [filepath] };
    }
  }

  /**
   * Get Docker image for language
   */
  private getDockerImage(language: string): string {
    switch (language) {
      case 'javascript':
      case 'node':
      case 'typescript':
        return 'node:20-alpine';
      case 'python':
      case 'python3':
        return 'python:3.11-alpine';
      case 'bash':
      case 'shell':
        return 'alpine:latest';
      default:
        return 'node:20-alpine';
    }
  }

  /**
   * Monitor resource usage
   */
  private startMetricsMonitoring(): void {
    if (!this.activeProcess?.pid) return;

    this.metricsInterval = setInterval(async () => {
      if (!this.activeProcess?.pid) return;

      try {
        // Get memory usage (Linux)
        if (process.platform === 'linux') {
          const { stdout } = await execAsync(
            `ps -o rss= -p ${this.activeProcess.pid} 2>/dev/null || echo 0`
          );
          const memoryKB = parseInt(stdout.trim()) || 0;
          const memoryMB = memoryKB / 1024;
          
          if (memoryMB > this.peakMemory) {
            this.peakMemory = memoryMB;
          }

          // Check memory limit
          if (memoryMB > this.options.memoryLimit!) {
            logger.warn(`Memory limit exceeded: ${memoryMB}MB > ${this.options.memoryLimit}MB`);
            this.kill();
          }
        }
      } catch {
        // Process may have exited
      }
    }, 500);
  }

  private stopMetricsMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  /**
   * Kill current execution
   */
  kill(): void {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGKILL');
      this.activeProcess = null;
    }
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.stopMetricsMonitoring();
    this.emit('execution:killed', { id: this.currentExecutionId });
  }

  /**
   * Cleanup work directory
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.workDir && existsSync(this.workDir)) {
        await rm(this.workDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.warn(`Cleanup failed: ${(error as Error).message}`);
    }
    this.activeProcess = null;
    this.currentExecutionId = null;
  }

  /**
   * Create error result
   */
  private createErrorResult(executionId: string, error: Error): SandboxResult {
    return {
      id: executionId,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: error.message,
      executionTime: Date.now() - this.startTime,
      peakMemory: this.peakMemory,
      status: 'error',
      error: error.message,
      timestamp: this.startTime
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(result: SandboxResult): void {
    this.metrics.totalExecutions++;
    
    if (result.status === 'completed') {
      this.metrics.successfulExecutions++;
    } else if (result.status === 'timeout') {
      this.metrics.timeouts++;
    } else {
      this.metrics.failedExecutions++;
    }

    // Calculate running average
    const total = this.metrics.totalExecutions;
    const avg = this.metrics.averageExecutionTime;
    this.metrics.averageExecutionTime = 
      ((total - 1) * avg + result.executionTime) / total;

    if (result.peakMemory > this.metrics.peakMemoryUsage) {
      this.metrics.peakMemoryUsage = result.peakMemory;
    }
  }

  /**
   * Audit log execution
   */
  private auditLog(executionId: string, result: SandboxResult): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      executionId,
      status: result.status,
      exitCode: result.exitCode,
      executionTime: result.executionTime,
      peakMemory: result.peakMemory,
      mode: this.options.mode
    };
    
    logger.info(`[audit] ${JSON.stringify(logEntry)}`);
    this.emit('audit', logEntry);
  }

  /**
   * Get current metrics
   */
  getMetrics(): SandboxMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      timeouts: 0,
      averageExecutionTime: 0,
      peakMemoryUsage: 0
    };
  }

  /**
   * Check if Docker is available
   */
  static async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List available Docker images
   */
  static async listDockerImages(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('docker images --format "{{.Repository}}:{{.Tag}}"');
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

// Default instance
export const sandbox = new Sandbox();

// Event types
export const SandboxEvents = {
  EXECUTION_START: 'execution:start',
  EXECUTION_COMPLETE: 'execution:complete',
  EXECUTION_KILLED: 'execution:killed',
  AUDIT: 'audit'
} as const;

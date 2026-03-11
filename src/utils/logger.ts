import pino from 'pino';

export class Logger {
  private logger: pino.Logger;

  constructor(name: string) {
    this.logger = pino({
      name,
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino/file',
        options: { destination: 1 }
      }
    });
  }

  debug(msg: string, ...args: unknown[]) {
    this.logger.debug(msg, ...args);
  }

  info(msg: string, ...args: unknown[]) {
    this.logger.info(msg, ...args);
  }

  warn(msg: string, ...args: unknown[]) {
    this.logger.warn(msg, ...args);
  }

  error(msg: string, error?: Error | unknown) {
    if (error instanceof Error) {
      this.logger.error({ err: error, msg });
    } else {
      this.logger.error(msg, error);
    }
  }
}

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

export const appConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  kiloPath: process.env.KILO_PATH || '/home/vincent/.nvm/versions/node/v24.13.1/bin/kilo',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean)
};

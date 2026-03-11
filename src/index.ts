import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Logger } from './utils/logger.js';
import { SessionManager } from './acp/session.js';
import { AcpClient } from './acp/client.js';
import sessionRoutes from './server/routes/session.js';
import gitRoutes from './server/routes/git.js';
import githubRoutes from './server/routes/github.js';
import { initDb } from './db/index.js';
import { authMiddleware } from './server/middleware/auth.js';
import { corsMiddleware } from './server/middleware/cors.js';
import { rateLimitMiddleware } from './server/middleware/rateLimit.js';
import { config } from 'dotenv';

config();

const PORT = process.env.PORT || 3000;
const KILO_PATH = process.env.KILO_PATH || '/home/vincent/.nvm/versions/node/v24.13.1/bin/kilo';

const logger = new Logger('main');

try {
  initDb();
  logger.info('Database initialized successfully');
} catch (err) {
  logger.error('Failed to initialize database', err);
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const sessionManager = new SessionManager(KILO_PATH);

app.use(express.json());

app.use(corsMiddleware);
app.use(rateLimitMiddleware);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessionManager.getSessionCount() });
});

app.use('/api/session', authMiddleware, sessionRoutes(sessionManager));
app.use('/api/git', authMiddleware, gitRoutes());
app.use('/api/github', authMiddleware, githubRoutes);

wss.on('connection', (ws, req) => {
  const sessionId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('sessionId');
  
  if (!sessionId) {
    ws.close(1008, 'Session ID required');
    return;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    ws.close(1008, 'Session not found');
    return;
  }

  logger.info(`WebSocket connected to session ${sessionId}`);
  
  const send = (type: string, data: unknown) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
    }
  };

  session.on('update', (data) => send('update', data));
  session.on('tool', (data) => send('tool', data));
  session.on('permission', (data) => send('permission', data));
  session.on('end', (data) => send('end', data));
  session.on('error', (error) => send('error', error));

  ws.on('message', async (message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.type === 'prompt') {
        await session.sendPrompt(payload.content);
        send('prompt-queued', { content: payload.content });
      } else if (payload.type === 'cancel') {
        await session.cancel();
        send('cancelled', {});
      }
    } catch (err) {
      logger.error('WebSocket message error', err);
      send('error', { message: (err as Error).message });
    }
  });

  ws.on('close', () => {
    logger.info(`WebSocket disconnected from session ${sessionId}`);
  });
});

server.listen(PORT, () => {
  logger.info(`Omni-Server Frame running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await sessionManager.shutdown();
  server.close(() => {
    logger.info('Server closed, PM2 will manage restart');
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await sessionManager.shutdown();
  server.close(() => {
    logger.info('Server closed, PM2 will manage restart');
  });
});

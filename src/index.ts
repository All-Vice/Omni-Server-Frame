import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Logger } from './utils/logger.js';
import { SessionManager } from './acp/session.js';
import { AcpClient } from './acp/client.js';
import sessionRoutes from './server/routes/session.js';
import gitRoutes from './server/routes/git.js';
import { config } from 'dotenv';

config();

const PORT = process.env.PORT || 3000;
const KILO_PATH = process.env.KILO_PATH || '/home/vincent/.nvm/versions/node/v24.13.1/bin/kilo';

const logger = new Logger('main');
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const sessionManager = new SessionManager(KILO_PATH);

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessionManager.getSessionCount() });
});

app.use('/api/session', sessionRoutes(sessionManager));
app.use('/api/git', gitRoutes());

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
  
  session.on('update', (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'update', data }));
    }
  });

  session.on('error', (error) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'error', data: error }));
    }
  });

  ws.on('message', async (message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.type === 'prompt') {
        await session.sendPrompt(payload.content);
      } else if (payload.type === 'cancel') {
        await session.cancel();
      }
    } catch (err) {
      logger.error('WebSocket message error', err);
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

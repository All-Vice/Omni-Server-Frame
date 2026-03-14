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
import { eventBus, SystemEvents, taskQueue, memorySystem, scheduler, AgentPool, sandbox, Sandbox } from './core/index.js';

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
const agentPool = new AgentPool(sessionManager, {
  minAgents: 2,
  maxAgents: 10,
  kiloPath: KILO_PATH,
});

app.use(express.json());

app.use(corsMiddleware);
app.use(rateLimitMiddleware);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sessions: sessionManager.getSessionCount(),
    systems: {
      eventBus: { subscribers: eventBus.listenerCount('*') },
      taskQueue: taskQueue.getQueueStatus(),
      memory: memorySystem.getStats(),
      scheduler: scheduler.getStatus(),
      agentPool: agentPool.getStatus(),
      sandbox: sandbox.getMetrics(),
    }
  });
});

app.get('/api/core/status', authMiddleware, (req, res) => {
  res.json({
    eventBus: {
      subscribers: eventBus.listenerCount('*'),
    },
    taskQueue: taskQueue.getQueueStatus(),
    memory: memorySystem.getStats(),
    scheduler: scheduler.getStatus(),
    agentPool: agentPool.getStatus(),
    sandbox: sandbox.getMetrics(),
  });
});

app.post('/api/core/task', authMiddleware, async (req, res) => {
  const { name, payload, priority = 'normal' } = req.body;
  if (!name || !payload) {
    return res.status(400).json({ error: 'name and payload required' });
  }
  const taskId = await taskQueue.enqueue(name, payload, priority);
  res.json({ taskId });
});

app.get('/api/core/task/:id', authMiddleware, (req, res) => {
  const task = taskQueue.getTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

app.get('/api/core/memory', authMiddleware, (req, res) => {
  const { tags, limit = 10 } = req.query;
  const tagArray = tags ? (tags as string).split(',') : undefined;
  const memories = memorySystem.search({ tags: tagArray, limit: Number(limit) });
  res.json(memories);
});

app.post('/api/core/memory', authMiddleware, (req, res) => {
  const { content, tags, metadata, importance = 5 } = req.body;
  if (!content || !tags) {
    return res.status(400).json({ error: 'content and tags required' });
  }
  const id = memorySystem.store(content, tags, metadata, importance);
  res.json({ id });
});

app.get('/api/core/memory/:id', authMiddleware, (req, res) => {
  const memory = memorySystem.retrieve(Number(req.params.id));
  if (!memory) {
    return res.status(404).json({ error: 'Memory not found' });
  }
  res.json(memory);
});

app.get('/api/core/scheduler', authMiddleware, (req, res) => {
  res.json(scheduler.getAllTasks());
});

app.get('/api/core/agent-pool', authMiddleware, (req, res) => {
  res.json(agentPool.getAllAgents().map(a => ({
    id: a.id,
    status: a.status,
    tasksCompleted: a.tasksCompleted,
    tasksFailed: a.tasksFailed,
    startedAt: a.startedAt,
    lastUsedAt: a.lastUsedAt,
  })));
});

// Sandbox API endpoints
app.get('/api/core/sandbox/status', authMiddleware, (req, res) => {
  res.json({
    metrics: sandbox.getMetrics(),
    dockerAvailable: Sandbox.isDockerAvailable(),
  });
});

app.post('/api/core/sandbox/reset-metrics', authMiddleware, (req, res) => {
  sandbox.resetMetrics();
  res.json({ success: true, metrics: sandbox.getMetrics() });
});

app.post('/api/core/sandbox/execute', authMiddleware, async (req, res) => {
  const { code, language = 'javascript', mode = 'process', timeout, memoryLimit } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  try {
    // Create sandbox instance with options
    const sandboxInstance = new Sandbox({
      mode,
      timeout: timeout || 30000,
      memoryLimit: memoryLimit || 512,
    });

    const result = await sandboxInstance.execute(code, language);
    res.json(result);
  } catch (error) {
    logger.error('Sandbox execution error', error);
    res.status(500).json({ 
      error: 'Execution failed', 
      message: (error as Error).message 
    });
  }
});

app.delete('/api/core/sandbox/execution', authMiddleware, (req, res) => {
  sandbox.kill();
  res.json({ success: true, message: 'Execution killed' });
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

server.listen(PORT, async () => {
  logger.info(`Omni-Server Frame running on port ${PORT}`);
  
  await agentPool.initialize();
  logger.info('Agent pool initialized');
  
  await scheduler.schedule('health-check', '*/5 * * * *', async () => {
    const stats = {
      sessions: sessionManager.getSessionCount(),
      taskQueue: taskQueue.getQueueStatus(),
      scheduler: scheduler.getStatus(),
      memory: memorySystem.getStats(),
      agentPool: agentPool.getStatus(),
      sandbox: sandbox.getMetrics(),
    };
    logger.debug('Health check:', stats);
  });
  
  await scheduler.scheduleInterval('stats-logging', 60000, async () => {
    const status = scheduler.getStatus();
    logger.info(`Scheduled tasks: ${status.totalRuns} total runs`);
  });
  
  eventBus.publish(SystemEvents.SERVER_READY, { port: PORT });
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Try a different port.`);
  } else {
    logger.error('Server error:', err);
  }
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  eventBus.publish(SystemEvents.SERVER_SHUTDOWN, {});
  await scheduler.shutdown();
  await taskQueue.shutdown();
  await agentPool.shutdown();
  await sessionManager.shutdown();
  memorySystem.close();
  server.close(() => {
    logger.info('Server closed, PM2 will manage restart');
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  eventBus.publish(SystemEvents.SERVER_SHUTDOWN, {});
  await scheduler.shutdown();
  await taskQueue.shutdown();
  await agentPool.shutdown();
  await sessionManager.shutdown();
  memorySystem.close();
  server.close(() => {
    logger.info('Server closed, PM2 will manage restart');
  });
});

import { Router, Request, Response } from 'express';
import { SessionManager } from '../acp/session.js';

export default function createSessionRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { model, mode } = req.body;
      const sessionId = await sessionManager.createSession({ model, mode });
      res.status(201).json({ sessionId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/:id', (req: Request, res: Response) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({
      id: session.id,
      status: session.status,
      model: session.model,
      mode: session.mode,
      createdAt: new Date()
    });
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await session.terminate();
    res.json({ success: true });
  });

  router.put('/:id/model', async (req: Request, res: Response) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const { model } = req.body;
    session.model = model;
    res.json({ success: true });
  });

  router.put('/:id/mode', async (req: Request, res: Response) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const { mode } = req.body;
    session.mode = mode;
    res.json({ success: true });
  });

  router.get('/', (req: Request, res: Response) => {
    res.json({ count: sessionManager.getSessionCount() });
  });

  return router;
}

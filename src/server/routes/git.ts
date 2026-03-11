import { Router, Request, Response } from 'express';
import { gitService } from '../../services/git.js';

export default function createGitRoutes(): Router {
  const router = Router();

  router.get('/status', async (req: Request, res: Response) => {
    try {
      const status = await gitService.status();
      res.json({ success: true, status });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/commit', async (req: Request, res: Response) => {
    try {
      const { message, files } = req.body;
      if (!message) {
        res.status(400).json({ success: false, error: 'Commit message required' });
        return;
      }
      await gitService.add(files || '.');
      const result = await gitService.commit(message);
      res.json({ success: true, commit: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/push', async (req: Request, res: Response) => {
    try {
      const { remote, branch } = req.body;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
      
      const result = await gitService.push(remote || 'origin', branch || 'main');
      res.end(JSON.stringify({ success: true, result }));
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/pull', async (req: Request, res: Response) => {
    try {
      const { remote, branch } = req.body;
      const result = await gitService.pull(remote || 'origin', branch || 'main');
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/log', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const log = await gitService.log(limit);
      res.json({ success: true, log });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/branch', async (req: Request, res: Response) => {
    try {
      const branch = await gitService.branch();
      res.json({ success: true, branch });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/fetch', async (req: Request, res: Response) => {
    try {
      const result = await gitService.fetch();
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/remote', async (req: Request, res: Response) => {
    try {
      const url = await gitService.getRemoteUrl();
      res.json({ success: true, remote: url });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}

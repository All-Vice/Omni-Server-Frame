import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

function cleanup(): void {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}

setInterval(cleanup, WINDOW_MS);

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  
  if (!store[key] || store[key].resetTime < now) {
    store[key] = { count: 1, resetTime: now + WINDOW_MS };
    return next();
  }

  store[key].count++;

  if (store[key].count > MAX_REQUESTS) {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' }
    });
    return;
  }

  next();
}

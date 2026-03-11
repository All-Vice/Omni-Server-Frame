import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../utils/logger.js';

const logger = new Logger('auth');

const API_KEY = process.env.API_KEY;
const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (AUTH_DISABLED) {
    return next();
  }

  if (!API_KEY) {
    logger.warn('API_KEY not configured - authentication disabled');
    return next();
  }

  const providedKey = req.headers['x-api-key'] as string | undefined;
  
  if (!providedKey) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'API key required' }
    });
    return;
  }

  if (providedKey !== API_KEY) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid API key' }
    });
    return;
  }

  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  if (AUTH_DISABLED || !API_KEY) {
    return next();
  }

  const providedKey = req.headers['x-api-key'] as string | undefined;
  
  if (providedKey && providedKey === API_KEY) {
    (req as any).authenticated = true;
  }
  
  next();
}

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

/**
 * Localhost Development Only Middleware
 * 
 * Restricts access to localhost-only endpoints for development convenience.
 * Provides strict security boundaries to prevent accidental production exposure.
 * 
 * Security Requirements:
 * 1. NODE_ENV must be 'development'
 * 2. Hostname must be 'localhost' or '127.0.0.1'
 * 
 * Used for /api/root/* endpoints that bypass authentication for UIX development.
 */
export const localhostDevelopmentOnlyMiddleware = async (context: Context, next: () => Promise<void>) => {
  // Check NODE_ENV first - most critical security boundary
  if (process.env.NODE_ENV !== 'development') {
    throw new HTTPException(403, {
      message: 'Root operations only available in development environment'
    });
  }
  
  // Check hostname - prevent remote access
  const url = new URL(context.req.url);
  const hostname = url.hostname;
  
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new HTTPException(403, {
      message: 'Root operations only available on localhost'
    });
  }
  
  // Log access for audit trail (using system if available, fallback to console)
  const system = context.get('system');
  const logMessage = 'Root API operation accessed';
  const logContext = { 
    endpoint: context.req.path, 
    method: context.req.method,
    hostname: hostname,
    environment: process.env.NODE_ENV
  };
  
  if (system) {
    system.warn(logMessage, logContext);
  } else {
    console.warn(logMessage, logContext);
  }
  
  await next();
};
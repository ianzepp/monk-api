import { Hono } from 'hono';
import { AuthService } from '@lib/auth.js';
import authLogin from './auth-login.js';
import authRefresh from './auth-refresh.js';
import authMe from './auth-me.js';

// Extend Hono context for our custom variables
declare module 'hono' {
    interface ContextVariableMap {
        user: any;
        userId: string;
        userDomain: string;
        userRole: string;
        accessReadIds: string[];
        accessEditIds: string[];
        accessFullIds: string[];
        database: any;
        databaseDomain: string;
        system: any; // System instance attached by systemContextMiddleware
        routeResult: any; // Route result for automatic formatting
    }
}

const app = new Hono();

// Auth endpoints using extracted handlers
app.post('/login', authLogin);
app.post('/refresh', authRefresh);
app.get('/me', AuthService.getJWTMiddleware(), AuthService.getUserContextMiddleware(), authMe);

export default app;
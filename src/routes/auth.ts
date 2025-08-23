import { Hono } from 'hono';
import { AuthService } from '@lib/auth.js';
import { 
    createSuccessResponse, 
    createValidationError,
    createInternalError 
} from '@lib/api/responses.js';

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
    }
}

const app = new Hono();

// POST /auth/login - Authenticate with tenant and username
app.post('/login', async (c) => {
    try {
        const body = await c.req.json();
        const { tenant, username } = body;

        if (!tenant) {
            return createValidationError(c, 'Tenant required', [
                { path: ['tenant'], message: 'Tenant is required' }
            ]);
        }

        if (!username) {
            return createValidationError(c, 'Username required', [
                { path: ['username'], message: 'Username is required' }
            ]);
        }

        const result = await AuthService.login(tenant, username);

        if (!result) {
            return c.json({
                success: false,
                error: 'Authentication failed',
                error_code: 'AUTH_FAILED'
            }, 401);
        }

        return createSuccessResponse(c, result);
    } catch (error) {
        console.error('Login error:', error);
        return createInternalError(c, 'Login failed');
    }
});

// POST /auth/refresh - Refresh JWT token
app.post('/refresh', async (c) => {
    try {
        const body = await c.req.json();
        const { token } = body;

        if (!token) {
            return createValidationError(c, 'Token required for refresh', [
                { path: ['token'], message: 'Token is required' }
            ]);
        }

        const newToken = await AuthService.refreshToken(token);

        if (!newToken) {
            return c.json({
                success: false,
                error: 'Token refresh failed',
                error_code: 'TOKEN_REFRESH_FAILED'
            }, 401);
        }

        return createSuccessResponse(c, { token: newToken });
    } catch (error) {
        console.error('Token refresh error:', error);
        return createInternalError(c, 'Token refresh failed');
    }
});

// GET /auth/me - Get current user info from JWT
app.get('/me', AuthService.getJWTMiddleware(), AuthService.getUserContextMiddleware(), async (c) => {
    try {
        const user = c.get('user');
        
        return createSuccessResponse(c, {
            id: user.id,
            username: user.username,
            email: user.email,
            tenant: user.tenant,
            database: user.database,
            role: user.role,
            is_active: user.is_active,
            last_login: user.last_login
        });
    } catch (error) {
        console.error('Get user info error:', error);
        return createInternalError(c, 'Failed to get user info');
    }
});

export default app;
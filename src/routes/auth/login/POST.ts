import type { Context } from 'hono';
import { AuthService } from '@lib/auth.js';
import { 
    createSuccessResponse, 
    createValidationError,
    createInternalError 
} from '@lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    try {
        const body = await context.req.json();
        const { tenant, username } = body;

        if (!tenant) {
            return createValidationError(context, 'Tenant required', [
                { path: ['tenant'], message: 'Tenant is required' }
            ]);
        }

        if (!username) {
            return createValidationError(context, 'Username required', [
                { path: ['username'], message: 'Username is required' }
            ]);
        }

        const result = await AuthService.login(tenant, username);

        if (!result) {
            return context.json({
                success: false,
                error: 'Authentication failed',
                error_code: 'AUTH_FAILED'
            }, 401);
        }

        return createSuccessResponse(context, result);
    } catch (error) {
        console.error('Login error:', error);
        return createInternalError(context, 'Login failed');
    }
}
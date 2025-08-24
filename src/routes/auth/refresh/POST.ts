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
        const { token } = body;

        if (!token) {
            return createValidationError(context, 'Token required for refresh', [
                { path: ['token'], message: 'Token is required' }
            ]);
        }

        const newToken = await AuthService.refreshToken(token);

        if (!newToken) {
            return context.json({
                success: false,
                error: 'Token refresh failed',
                error_code: 'TOKEN_REFRESH_FAILED'
            }, 401);
        }

        return createSuccessResponse(context, { token: newToken });
    } catch (error) {
        console.error('Token refresh error:', error);
        return createInternalError(context, 'Token refresh failed');
    }
}
import type { Context } from 'hono';
import { 
    createSuccessResponse, 
    createInternalError 
} from '@lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    try {
        const user = context.get('user');
        
        return createSuccessResponse(context, {
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
        return createInternalError(context, 'Failed to get user info');
    }
}
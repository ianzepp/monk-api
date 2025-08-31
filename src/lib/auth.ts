import { sign, verify } from 'hono/jwt';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import type { JWTPayload } from '@src/lib/middleware/jwt-validation.js';

export class AuthService {
    private static tokenExpiry = 24 * 60 * 60; // 24 hours in seconds


    // Generate JWT token for user
    static async generateToken(user: any): Promise<string> {
        const payload: JWTPayload = {
            sub: user.id,
            user_id: user.user_id || null, // User ID for database records (null for root/system)
            tenant: user.tenant,
            database: user.database,
            access: user.access || 'root', // Access level for API operations
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + this.tokenExpiry,
        };

        return await sign(payload, process.env['JWT_SECRET']!);
    }

    // Verify and decode JWT token
    static async verifyToken(token: string): Promise<JWTPayload> {
        return (await verify(token, process.env['JWT_SECRET']!)) as JWTPayload;
    }

    // Login with tenant and username authentication
    static async login(tenant: string, username: string): Promise<{ token: string; user: any } | null> {
        if (!tenant || !username) {
            return null; // Both tenant and username required
        }

        // Look up tenant record to get database name
        const authDb = DatabaseConnection.getMainPool();
        const tenantResult = await authDb.query('SELECT name, database FROM tenants WHERE name = $1 AND is_active = true AND trashed_at IS NULL AND deleted_at IS NULL', [tenant]);

        if (!tenantResult.rows || tenantResult.rows.length === 0) {
            return null; // Tenant not found or inactive
        }

        console.info('tenantResult:', tenantResult);
        const { name, database } = tenantResult.rows[0];

        // Look up user in the tenant's database
        const tenantDb = DatabaseConnection.getTenantPool(database);
        const userResult = await tenantDb.query(
            'SELECT id, name, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [username]
        );

        if (!userResult.rows || userResult.rows.length === 0) {
            return null; // User not found or inactive
        }

        const user = userResult.rows[0];

        // Create user object for JWT
        const authUser = {
            id: user.id,
            user_id: user.id,
            tenant: name,
            database: database,
            username: user.name,
            access: user.access,
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
            access_deny: user.access_deny || [],
            is_active: true,
        };

        // Generate token
        const token = await this.generateToken(authUser);

        return {
            token,
            user: {
                id: authUser.id,
                username: authUser.username,
                tenant: authUser.tenant,
                database: authUser.database,
                access: authUser.access,
            },
        };
    }

    // Refresh token (extend expiration)
    static async refreshToken(oldToken: string): Promise<string | null> {
        try {
            const payload = await this.verifyToken(oldToken);

            // For test mode, recreate test user from payload
            const testUser = {
                id: payload.sub,
                username: payload.username,
                email: payload.email,
                tenant: payload.tenant,
                database: payload.database,
                role: payload.role,
                access_read: payload.access_read,
                access_edit: payload.access_edit,
                access_full: payload.access_full,
                is_active: true,
                last_login: new Date().toISOString(),
            };

            // Generate new token with fresh timestamps
            return await this.generateToken(testUser);
        } catch (error) {
            return null; // Token invalid or expired
        }
    }

}

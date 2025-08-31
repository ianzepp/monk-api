import type { Context, Next } from 'hono';
import { jwt } from 'hono/jwt';
import { sign, verify } from 'hono/jwt';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import pg from 'pg';

export interface JWTPayload {
    sub: string; // Subject/system identifier
    user_id: string | null; // User ID for database records (null for root/system)
    tenant: string; // Tenant name
    database: string; // Database name (converted)
    access: string; // Access level (deny/read/edit/full/root)
    access_read: string[]; // ACL read access
    access_edit: string[]; // ACL edit access
    access_full: string[]; // ACL full access
    iat: number; // Issued at
    exp: number; // Expires at
    [key: string]: any; // Index signature for Hono compatibility
}

export class AuthService {
    private static tokenExpiry = 24 * 60 * 60; // 24 hours in seconds
    private static authPool: pg.Pool | null = null;

    private static getJwtSecret(): string {
        return process.env['JWT_SECRET']!;
    }

    // Get persistent auth database connection
    private static getAuthDatabase(): pg.Pool {
        // Use centralized database connection to monk database
        return DatabaseConnection.getMainPool();
    }

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

        return await sign(payload, this.getJwtSecret());
    }

    // Verify and decode JWT token
    static async verifyToken(token: string): Promise<JWTPayload> {
        return (await verify(token, this.getJwtSecret())) as JWTPayload;
    }

    // Login with tenant and username authentication
    static async login(tenant: string, username: string): Promise<{ token: string; user: any } | null> {
        if (!tenant || !username) {
            return null; // Both tenant and username required
        }

        // Look up tenant record to get database name
        const authDb = this.getAuthDatabase();
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

    // Get Hono JWT middleware with proper error handling
    static getJWTMiddleware() {
        return async (c: Context, next: Next) => {
            try {
                // Use Hono's built-in JWT middleware
                await jwt({ secret: this.getJwtSecret() })(c, next);
            } catch (error: any) {
                // Convert JWT middleware errors to proper HttpErrors
                if (error instanceof Error) {
                    if (
                        error.message === 'Unauthorized' ||
                        (error.cause && typeof error.cause === 'object' && 'name' in error.cause && (error.cause.name === 'JwtTokenExpired' || error.cause.name === 'JwtTokenInvalid')) ||
                        error.message.includes('jwt')
                    ) {
                        throw HttpErrors.unauthorized('Authentication required', 'TOKEN_INVALID');
                    }
                }

                // Re-throw other errors
                throw error;
            }
        };
    }

    // Enhanced auth middleware with user context
    static getUserContextMiddleware() {
        return async (c: Context, next: Next) => {
            const payload = c.get('jwtPayload') as JWTPayload;

            try {
                // Set up database connection for the JWT database
                DatabaseConnection.setDatabaseForRequest(c, payload.database);

                // Create user object from JWT payload (for test mode)
                const user = {
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
                    last_login: new Date(payload.iat * 1000).toISOString(),
                };

                // Set user context for handlers
                c.set('user', user);
                c.set('userId', payload.sub);
                c.set('accessReadIds', payload.access_read || []);
                c.set('accessEditIds', payload.access_edit || []);
                c.set('accessFullIds', payload.access_full || []);
            } catch (error) {
                console.error('Database setup error:', error);
                return c.json(
                    {
                        success: false,
                        error: 'Database connection failed for tenant',
                        error_code: 'DATABASE_ERROR',
                    },
                    500
                );
            }

            await next();
        };
    }

    // Role-based middleware
    static requireRole(requiredRole: string) {
        return async (c: Context, next: Next) => {
            const userRole = c.get('userRole');

            if (userRole !== requiredRole) {
                return c.json(
                    {
                        success: false,
                        error: `${requiredRole} role required`,
                        error_code: 'INSUFFICIENT_PERMISSIONS',
                    },
                    403
                );
            }

            await next();
        };
    }
}

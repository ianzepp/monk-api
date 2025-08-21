import type { Context } from 'hono';
import { jwt } from 'hono/jwt';
import { sign, verify } from 'hono/jwt';
import { DatabaseManager } from './database-manager.js';

export interface JWTPayload {
    sub: string;           // Subject/system identifier
    user_id: string | null; // User ID for database records (null for root/system)
    domain: string;        // User's domain
    access: string;        // Access level (deny/read/edit/full/root)
    access_read: string[]; // ACL read access
    access_edit: string[]; // ACL edit access
    access_full: string[]; // ACL full access
    iat: number;           // Issued at
    exp: number;           // Expires at
    [key: string]: any;    // Index signature for Hono compatibility
}

export class AuthService {
    private static jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-change-this';
    private static tokenExpiry = 24 * 60 * 60; // 24 hours in seconds

    // Generate JWT token for user
    static async generateToken(user: any): Promise<string> {
        const payload: JWTPayload = {
            sub: user.id,
            user_id: user.user_id || null, // User ID for database records (null for root/system)
            domain: user.domain,
            access: user.access || 'root', // Access level for API operations
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + this.tokenExpiry
        };

        return await sign(payload, this.jwtSecret);
    }

    // Verify and decode JWT token
    static async verifyToken(token: string): Promise<JWTPayload> {
        return await verify(token, this.jwtSecret) as JWTPayload;
    }

    // Login with domain for test authentication
    static async login(domain: string): Promise<{ token: string; user: any } | null> {
        if (!domain) {
            return null; // Domain required
        }

        // Create test user object with domain and root access
        const testUser = {
            id: 'test-user',
            user_id: null, // No user ID for system/test authentication
            domain: domain,
            access: 'root', // Give everyone root access for now
            access_read: [],
            access_edit: [],
            access_full: [],
            is_active: true
        };

        // Generate token
        const token = await this.generateToken(testUser);

        return {
            token,
            user: {
                id: testUser.id,
                domain: testUser.domain,
                access: testUser.access
            }
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
                domain: payload.domain,
                role: payload.role,
                access_read: payload.access_read,
                access_edit: payload.access_edit,
                access_full: payload.access_full,
                is_active: true,
                last_login: new Date().toISOString()
            };

            // Generate new token with fresh timestamps
            return await this.generateToken(testUser);
        } catch (error) {
            return null; // Token invalid or expired
        }
    }

    // Get Hono JWT middleware
    static getJWTMiddleware() {
        return jwt({ secret: this.jwtSecret });
    }

    // Enhanced auth middleware with user context
    static getUserContextMiddleware() {
        return async (c: Context, next: Function) => {
            const payload = c.get('jwtPayload') as JWTPayload;
            
            try {
                // Set up database connection for the JWT domain
                await DatabaseManager.setDatabaseForRequest(c, payload.domain);

                // Create user object from JWT payload (for test mode)
                const user = {
                    id: payload.sub,
                    username: payload.username,
                    email: payload.email,
                    domain: payload.domain,
                    role: payload.role,
                    access_read: payload.access_read,
                    access_edit: payload.access_edit,
                    access_full: payload.access_full,
                    is_active: true,
                    last_login: new Date(payload.iat * 1000).toISOString()
                };

                // Set user context for handlers
                c.set('user', user);
                c.set('userId', payload.sub);
                c.set('userDomain', payload.domain);
                c.set('userRole', payload.role);
                c.set('accessReadIds', payload.access_read || []);
                c.set('accessEditIds', payload.access_edit || []);
                c.set('accessFullIds', payload.access_full || []);

            } catch (error) {
                console.error('Database setup error:', error);
                return c.json({ 
                    success: false, 
                    error: 'Database connection failed for domain',
                    error_code: 'DATABASE_ERROR'
                }, 500);
            }

            await next();
        };
    }

    // Role-based middleware
    static requireRole(requiredRole: string) {
        return async (c: Context, next: Function) => {
            const userRole = c.get('userRole');
            
            if (userRole !== requiredRole) {
                return c.json({
                    success: false,
                    error: `${requiredRole} role required`,
                    error_code: 'INSUFFICIENT_PERMISSIONS'
                }, 403);
            }
            
            await next();
        };
    }

    // Domain access middleware  
    static requireDomainAccess() {
        return async (c: Context, next: Function) => {
            const requestDomain = c.req.query('domain');
            const userDomain = c.get('userDomain');
            const userRole = c.get('userRole');
            
            // Admins can access any domain
            if (userRole === 'admin') {
                await next();
                return;
            }
            
            // Users can only access their own domain or public data
            if (requestDomain && requestDomain !== userDomain) {
                return c.json({
                    success: false,
                    error: 'Domain access denied',
                    error_code: 'DOMAIN_ACCESS_DENIED'
                }, 403);
            }
            
            await next();
        };
    }
}
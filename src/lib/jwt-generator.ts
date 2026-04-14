/**
 * JWT Token Generator - Centralized JWT creation and verification
 *
 * Provides consistent JWT generation across all authentication flows.
 * All JWTs use compact field names (db, ns) to minimize token size.
 */

import { sign, verify } from 'hono/jwt';
import { JWT_DEFAULT_EXPIRY, JWT_DISSOLVE_EXPIRY } from './constants.js';
import type { SystemInit } from './system.js';

const JWT_ALGORITHM = 'HS256' as const;

/**
 * JWT Payload structure for all Monk API tokens
 */
export interface JWTPayload {
    sub: string;
    user_id: string | null;
    username: string;
    tenant: string;
    tenant_id?: string;
    db_type: 'postgresql' | 'sqlite'; // Database backend type
    db: string; // Database name (PG) or directory (SQLite)
    ns: string; // Namespace/schema name (PG) or filename (SQLite)
    access: string;
    access_read: string[];
    access_edit: string[];
    access_full: string[];
    iat: number;
    exp: number;
    // Sudo elevation metadata (optional)
    is_sudo?: boolean; // True if this is a short-lived sudo token
    elevated_from?: string; // Original access level before sudo
    elevated_at?: string; // When sudo was granted
    elevation_reason?: string; // Why sudo was requested
    // User impersonation metadata (optional)
    is_fake?: boolean; // True if this is a fake/impersonation token
    faked_by_user_id?: string; // ID of root user doing the faking
    faked_by_username?: string; // Name of root user doing the faking
    faked_at?: string; // When impersonation was initiated
    // Response format preference (optional)
    format?: string;
    [key: string]: any;
}

/**
 * Minimal payload for dissolve confirmation tokens.
 *
 * Intentionally does not extend JWTPayload — these tokens must not be
 * accepted by normal auth middleware.
 */
export interface DissolveTokenPayload {
    token_use: 'dissolve';
    tenant: string;
    tenant_id?: string;
    user_id: string;
    username: string;
    iat: number;
    exp: number;
    [key: string]: any;
}

/**
 * Standard user data for JWT generation
 */
export interface JWTUserData {
    id: string;
    user_id?: string | null;
    username: string;
    tenant: string;
    tenantId?: string;
    dbType?: 'postgresql' | 'sqlite'; // Maps to 'db_type' in JWT (default: 'postgresql')
    dbName: string; // Maps to 'db' in JWT
    nsName: string; // Maps to 'ns' in JWT
    access: string;
    access_read?: string[];
    access_edit?: string[];
    access_full?: string[];
    access_deny?: string[];
}

/**
 * Options for sudo token generation
 */
export interface SudoTokenOptions {
    reason?: string;
    duration?: number; // Duration in seconds (default: 900 = 15 minutes)
}

/**
 * Options for fake/impersonation token generation
 */
export interface FakeTokenOptions {
    faked_by_user_id: string;
    faked_by_username: string;
    duration?: number; // Duration in seconds (default: 900 = 15 minutes)
}

export class JWTGenerator {
    private static readonly DEFAULT_EXPIRY = JWT_DEFAULT_EXPIRY;
    private static readonly SUDO_EXPIRY = 15 * 60; // 15 minutes
    private static readonly FAKE_EXPIRY = 15 * 60; // 15 minutes (same as sudo for security)

    /**
     * Get JWT secret from environment
     */
    private static getJwtSecret(): string {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET environment variable is not set');
        }
        return secret;
    }

    /**
     * Generate standard JWT token for user authentication
     *
     * @param userData - User information for token
     * @param expirySeconds - Optional custom expiry (default: 24 hours)
     * @returns JWT token string
     */
    static async generateToken(userData: JWTUserData, expirySeconds?: number): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const expiry = expirySeconds || this.DEFAULT_EXPIRY;

        const payload: JWTPayload = {
            sub: userData.id,
            user_id: userData.user_id ?? userData.id,
            username: userData.username,
            tenant: userData.tenant,
            tenant_id: userData.tenantId,
            db_type: userData.dbType || 'postgresql', // Database backend type
            db: userData.dbName, // Compact JWT field
            ns: userData.nsName, // Compact JWT field
            access: userData.access,
            access_read: userData.access_read || [],
            access_edit: userData.access_edit || [],
            access_full: userData.access_full || [],
            iat: now,
            exp: now + expiry,
        };

        return await sign(payload, this.getJwtSecret(), JWT_ALGORITHM);
    }

    static async signPayload(payload: JWTPayload): Promise<string> {
        return await sign(payload, this.getJwtSecret(), JWT_ALGORITHM);
    }

    /**
     * Generate sudo (elevated privileges) token
     *
     * Creates a short-lived token with sudo flag for administrative operations.
     * Keeps original access level but sets is_sudo=true for audit trail.
     *
     * @param userData - User information for token
     * @param options - Sudo token options (reason, duration)
     * @returns JWT token string with sudo elevation
     */
    static async generateSudoToken(
        userData: JWTUserData,
        options: SudoTokenOptions = {}
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const duration = options.duration || this.SUDO_EXPIRY;

        const payload: JWTPayload = {
            sub: userData.id,
            user_id: userData.user_id ?? userData.id,
            username: userData.username,
            tenant: userData.tenant,
            tenant_id: userData.tenantId,
            db_type: userData.dbType || 'postgresql',
            db: userData.dbName,
            ns: userData.nsName,
            access: userData.access, // Keep original access level
            access_read: userData.access_read || [],
            access_edit: userData.access_edit || [],
            access_full: userData.access_full || [],
            iat: now,
            exp: now + duration,
            // Sudo elevation metadata
            is_sudo: true,
            elevated_from: userData.access,
            elevated_at: new Date().toISOString(),
            elevation_reason: options.reason || 'Administrative operation',
        };

        return await sign(payload, this.getJwtSecret(), JWT_ALGORITHM);
    }

    /**
     * Generate fake/impersonation token
     *
     * Creates a token for user impersonation by root users.
     * Includes metadata about who created the fake token for audit trail.
     *
     * @param targetUser - User being impersonated
     * @param currentUser - Current user data (for db/ns context)
     * @param options - Fake token options (faked_by info, duration)
     * @returns JWT token string with impersonation metadata
     */
    static async generateFakeToken(
        targetUser: { id: string; username: string; access: string; access_read?: string[]; access_edit?: string[]; access_full?: string[] },
        currentUser: { tenant: string; tenantId?: string; dbType?: 'postgresql' | 'sqlite'; dbName: string; nsName: string },
        options: FakeTokenOptions
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const duration = options.duration || this.FAKE_EXPIRY;

        const payload: JWTPayload = {
            sub: targetUser.id,
            user_id: targetUser.id,
            username: targetUser.username,
            tenant: currentUser.tenant,
            tenant_id: currentUser.tenantId,
            db_type: currentUser.dbType || 'postgresql',
            db: currentUser.dbName,
            ns: currentUser.nsName,
            access: targetUser.access,
            access_read: targetUser.access_read || [],
            access_edit: targetUser.access_edit || [],
            access_full: targetUser.access_full || [],
            iat: now,
            exp: now + duration,
            // Target user gets is_sudo if they're root
            is_sudo: targetUser.access === 'root',
            // Impersonation metadata
            is_fake: true,
            faked_by_user_id: options.faked_by_user_id,
            faked_by_username: options.faked_by_username,
            faked_at: new Date().toISOString(),
        };

        return await sign(payload, this.getJwtSecret(), JWT_ALGORITHM);
    }

    /**
     * Generate token from user and tenant records (registration/login flows)
     *
     * @param user - User record with id, auth (username), access, and ACL fields
     * @param tenant - Tenant record with name, db_type, database, schema
     * @param expirySeconds - Optional custom expiry (default: 24 hours)
     * @returns JWT token string
     */
    static async fromUserAndTenant(
        user: {
            id: string;
            auth: string;
            access: string;
            access_read?: string[];
            access_edit?: string[];
            access_full?: string[];
        },
        tenant: {
            name: string;
            tenant_id?: string;
            db_type: 'postgresql' | 'sqlite';
            database: string;
            schema: string;
        },
        expirySeconds?: number
    ): Promise<string> {
        return this.generateToken(
            {
                id: user.id,
                user_id: user.id,
                username: user.auth,
                tenant: tenant.name,
                tenantId: tenant.tenant_id,
                dbType: tenant.db_type,
                dbName: tenant.database,
                nsName: tenant.schema,
                access: user.access,
                access_read: user.access_read || [],
                access_edit: user.access_edit || [],
                access_full: user.access_full || [],
            },
            expirySeconds
        );
    }

    /**
     * Generate token from SystemInit (internal API calls)
     *
     * @param init - SystemInit object from authenticated session
     * @param expirySeconds - Optional custom expiry (default: 24 hours)
     * @returns JWT token string
     */
    static async fromSystemInit(init: SystemInit, expirySeconds?: number): Promise<string> {
        return this.generateToken(
            {
                id: init.userId || 'system',
                user_id: init.userId,
                username: init.username || 'system',
                tenant: init.tenant,
                tenantId: init.tenantId,
                dbType: init.dbType,
                dbName: init.dbName,
                nsName: init.nsName,
                access: init.access || 'read',
                access_read: init.accessRead || [],
                access_edit: init.accessEdit || [],
                access_full: init.accessFull || [],
            },
            expirySeconds
        );
    }

    /**
     * Generate token for root user with explicit tenant context
     *
     * @param userId - Root user ID
     * @param tenant - Tenant name
     * @param dbName - Database name
     * @param nsName - Namespace/schema name
     * @param expirySeconds - Optional custom expiry (default: 24 hours)
     * @returns JWT token string
     */
    static async forRootUser(
        userId: string,
        tenant: string,
        dbName: string,
        nsName: string,
        expirySeconds?: number
    ): Promise<string> {
        return this.generateToken(
            {
                id: userId,
                user_id: userId,
                username: 'root',
                tenant,
                dbType: 'postgresql',
                dbName,
                nsName,
                access: 'root',
                access_read: [],
                access_edit: [],
                access_full: [],
            },
            expirySeconds
        );
    }

    /**
     * Generate dissolve-confirmation token
     *
     * Produces a minimal, purpose-bound token that cannot be mistaken for a
     * normal access JWT.  Only the claims required to confirm dissolution are
     * included: token_use, tenant, tenant_id, user_id, username, iat, exp.
     *
     * @param tenant - Tenant name and optional ID
     * @param user - User ID and username
     * @returns JWT token string
     */
    static async generateDissolveToken(
        tenant: { name: string; tenantId?: string },
        user: { userId: string; username: string }
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const payload: DissolveTokenPayload = {
            token_use: 'dissolve',
            tenant: tenant.name,
            tenant_id: tenant.tenantId,
            user_id: user.userId,
            username: user.username,
            iat: now,
            exp: now + JWT_DISSOLVE_EXPIRY,
        };

        return await sign(payload, this.getJwtSecret(), JWT_ALGORITHM);
    }

    /**
     * Verify and decode a dissolve confirmation token
     *
     * @param token - JWT token string
     * @returns Decoded DissolveTokenPayload
     * @throws Error if token is invalid, expired, or not a dissolve token
     */
    static async verifyDissolveToken(token: string): Promise<DissolveTokenPayload> {
        const payload = await verify(token, this.getJwtSecret(), JWT_ALGORITHM) as DissolveTokenPayload;
        if (payload.token_use !== 'dissolve') {
            throw new Error('Not a dissolve token');
        }
        return payload;
    }

    /**
     * Verify and decode JWT token
     *
     * @param token - JWT token string
     * @returns Decoded JWT payload
     * @throws Error if token is invalid or expired
     */
    static async verifyToken(token: string): Promise<JWTPayload> {
        return (await verify(token, this.getJwtSecret(), JWT_ALGORITHM)) as JWTPayload;
    }

    /**
     * Validate JWT token and return payload (returns null on error)
     *
     * @param token - JWT token string
     * @returns Decoded payload or null if invalid
     */
    static async validateToken(token: string): Promise<JWTPayload | null> {
        try {
            return await this.verifyToken(token);
        } catch (error) {
            return null;
        }
    }
}

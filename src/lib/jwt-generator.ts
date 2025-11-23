/**
 * JWT Token Generator - Centralized JWT creation and verification
 *
 * Provides consistent JWT generation across all authentication flows.
 * All JWTs use compact field names (db, ns) to minimize token size.
 */

import { sign, verify } from 'hono/jwt';
import type { JWTPayload } from './services/tenant.js';

/**
 * Standard user data for JWT generation
 */
export interface JWTUserData {
    id: string;
    user_id?: string | null;
    tenant: string;
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
    duration?: number; // Duration in seconds (default: 3600 = 1 hour)
}

export class JWTGenerator {
    private static readonly DEFAULT_EXPIRY = 24 * 60 * 60; // 24 hours
    private static readonly SUDO_EXPIRY = 15 * 60; // 15 minutes
    private static readonly FAKE_EXPIRY = 60 * 60; // 1 hour

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
            tenant: userData.tenant,
            db: userData.dbName, // Compact JWT field
            ns: userData.nsName, // Compact JWT field
            access: userData.access,
            access_read: userData.access_read || [],
            access_edit: userData.access_edit || [],
            access_full: userData.access_full || [],
            iat: now,
            exp: now + expiry,
        };

        return await sign(payload, this.getJwtSecret());
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
            tenant: userData.tenant,
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

        return await sign(payload, this.getJwtSecret());
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
        targetUser: { id: string; access: string; access_read?: string[]; access_edit?: string[]; access_full?: string[] },
        currentUser: { tenant: string; dbName: string; nsName: string },
        options: FakeTokenOptions
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const duration = options.duration || this.FAKE_EXPIRY;

        const payload: JWTPayload = {
            sub: targetUser.id,
            user_id: targetUser.id,
            tenant: currentUser.tenant,
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

        return await sign(payload, this.getJwtSecret());
    }

    /**
     * Verify and decode JWT token
     *
     * @param token - JWT token string
     * @returns Decoded JWT payload
     * @throws Error if token is invalid or expired
     */
    static async verifyToken(token: string): Promise<JWTPayload> {
        return (await verify(token, this.getJwtSecret())) as JWTPayload;
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

/**
 * Authentication Service
 *
 * Core authentication logic extracted from route handlers.
 * Can be used by HTTP routes, TTY servers, and other internal services.
 */

import { Infrastructure } from '@src/lib/infrastructure.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { createAdapterFrom } from '@src/lib/database/index.js';
import { verifyPassword } from '@src/lib/credentials/index.js';
import { JWTGenerator, type JWTPayload } from '@src/lib/jwt-generator.js';
import { systemInitFromJWT, type SystemInit } from '@src/lib/system.js';

/**
 * Login request parameters
 */
export interface LoginRequest {
    tenant: string;
    username: string;
    password?: string;
}

/**
 * Authenticated user data
 */
export interface AuthenticatedUser {
    id: string;
    username: string;
    tenant: string;
    access: string;
    accessRead: string[];
    accessEdit: string[];
    accessFull: string[];
}

/**
 * Login result on success
 */
export interface LoginResult {
    success: true;
    user: AuthenticatedUser;
    token: string;
    payload: JWTPayload;
    systemInit: SystemInit;
}

/**
 * Login failure result
 */
export interface LoginFailure {
    success: false;
    error: string;
    errorCode: string;
}

/**
 * Authenticate a user with tenant, username, and optional password.
 *
 * @param request - Login credentials
 * @returns Login result or failure
 */
export async function login(request: LoginRequest): Promise<LoginResult | LoginFailure> {
    const { tenant, username, password } = request;

    // Look up tenant record from infrastructure database
    const tenantRecord = await Infrastructure.getTenant(tenant);

    if (!tenantRecord) {
        return {
            success: false,
            error: 'Authentication failed',
            errorCode: 'AUTH_LOGIN_FAILED',
        };
    }

    const { name, db_type: dbType, database: dbName, schema: nsName } = tenantRecord;

    // Look up user in the tenant's namespace
    let userResult: { rows: any[] };

    if (dbType === 'sqlite') {
        const adapter = createAdapterFrom('sqlite', dbName, nsName);
        await adapter.connect();
        try {
            userResult = await adapter.query(
                'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
                [username]
            );
        } finally {
            await adapter.disconnect();
        }
    } else {
        userResult = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [username]
        );
    }

    if (!userResult.rows || userResult.rows.length === 0) {
        return {
            success: false,
            error: 'Authentication failed',
            errorCode: 'AUTH_LOGIN_FAILED',
        };
    }

    const user = userResult.rows[0];

    // Check for password credential
    let credentialResult: { rows: any[] };

    if (dbType === 'sqlite') {
        const adapter = createAdapterFrom('sqlite', dbName, nsName);
        await adapter.connect();
        try {
            credentialResult = await adapter.query(
                `SELECT secret FROM credentials
                 WHERE user_id = $1 AND type = 'password' AND deleted_at IS NULL
                 ORDER BY created_at DESC LIMIT 1`,
                [user.id]
            );
        } finally {
            await adapter.disconnect();
        }
    } else {
        credentialResult = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            `SELECT secret FROM credentials
             WHERE user_id = $1 AND type = 'password' AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [user.id]
        );
    }

    // If user has a password credential, verify it
    if (credentialResult.rows && credentialResult.rows.length > 0) {
        const storedHash = credentialResult.rows[0].secret;

        // Password is required if user has one set
        if (!password) {
            return {
                success: false,
                error: 'Password is required',
                errorCode: 'AUTH_PASSWORD_REQUIRED',
            };
        }

        // Verify password
        const isValid = await verifyPassword(password, storedHash);
        if (!isValid) {
            return {
                success: false,
                error: 'Authentication failed',
                errorCode: 'AUTH_LOGIN_FAILED',
            };
        }
    }

    // Build JWT payload
    const payload: JWTPayload = {
        sub: user.id,
        user_id: user.id,
        tenant: name,
        db_type: dbType || 'postgresql',
        db: dbName,
        ns: nsName,
        access: user.access,
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        is_sudo: user.access === 'root',
    };

    // Generate token
    const token = await JWTGenerator.generateToken({
        id: user.id,
        tenant: name,
        dbType: dbType || 'postgresql',
        dbName,
        nsName,
        access: user.access,
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
    });

    // Create SystemInit for transaction usage
    const systemInit = systemInitFromJWT(payload);

    return {
        success: true,
        user: {
            id: user.id,
            username: user.auth,
            tenant: name,
            access: user.access,
            accessRead: user.access_read || [],
            accessEdit: user.access_edit || [],
            accessFull: user.access_full || [],
        },
        token,
        payload,
        systemInit,
    };
}

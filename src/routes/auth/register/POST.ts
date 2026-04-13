import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { Infrastructure } from '@src/lib/infrastructure.js';
import type { DatabaseType } from '@src/lib/database/adapter.js';
import {
    Auth0ConfigError,
    Auth0VerificationError,
    Auth0Verifier,
    Auth0IdentityMappingError,
    auth0UserAuthValue,
    createAuth0IdentityMapping,
    getAuth0IdentityMapping,
    type VerifiedAuth0Identity,
} from '@src/lib/auth0/index.js';

type Auth0VerifierFactory = () => Pick<Auth0Verifier, 'verifyAccessToken'>;

let auth0VerifierFactory: Auth0VerifierFactory | null = null;

export function setAuth0RegisterVerifierFactoryForTests(factory: Auth0VerifierFactory | null): void {
    auth0VerifierFactory = factory;
}

/**
 * POST /auth/register - Tenant registration
 *
 * Creates a new tenant with core tables (models, fields, users, filters)
 * and a root user mapped to a verified Auth0 issuer + subject.
 *
 * Request body:
 * - tenant (required): User-facing tenant name
 * - description (optional): Human-readable description of the tenant
 * - adapter (optional): Database adapter - 'postgresql' or 'sqlite' (inherits from infra config if not specified)
 *
 * Error codes:
 * - AUTH_TENANT_MISSING: Missing tenant field (400)
 * - INVALID_ADAPTER: Invalid adapter value (400)
 * - DATABASE_TENANT_EXISTS: Tenant name already registered (409)
 *
 * @see docs/routes/AUTH_API.md
 */
export default async function (context: Context) {
    const body = await context.req.json();
    const identity = await verifyRegistrationToken(context);

    // Body type validation
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
    }

    const { tenant, description, adapter } = body;

    // Input validation
    if (!tenant) {
        throw HttpErrors.badRequest('Tenant is required', 'AUTH_TENANT_MISSING');
    }

    const existingMapping = await getAuth0IdentityMapping(identity.iss, identity.sub);
    if (existingMapping) {
        throw HttpErrors.conflict(
            'Auth0 identity is already provisioned in Monk',
            'AUTH0_IDENTITY_ALREADY_PROVISIONED'
        );
    }

    // Validate adapter if specified
    let dbType: DatabaseType | undefined;
    if (adapter) {
        if (adapter !== 'postgresql' && adapter !== 'sqlite') {
            throw HttpErrors.badRequest(
                "Invalid adapter. Must be 'postgresql' or 'sqlite'",
                'INVALID_ADAPTER'
            );
        }
        dbType = adapter;
    }

    const ownerAuth = auth0UserAuthValue(identity.iss, identity.sub);

    // Create tenant with full provisioning
    let result;
    try {
        result = await Infrastructure.createTenant({
            name: tenant,
            db_type: dbType,
            owner_username: ownerAuth,
            description: description,
        });
    } catch (error: any) {
        // Check for duplicate tenant error
        if (error.message?.includes('already exists')) {
            throw HttpErrors.conflict(
                `Tenant '${tenant}' already exists`,
                'DATABASE_TENANT_EXISTS'
            );
        }
        throw error;
    }

    let mapping;
    try {
        mapping = await createAuth0IdentityMapping({
            issuer: identity.iss,
            subject: identity.sub,
            tenantId: result.tenant.id,
            userId: result.user.id,
        });
    } catch (error) {
        await Infrastructure.deleteTenant(result.tenant.name);
        if (error instanceof Auth0IdentityMappingError) {
            throw HttpErrors.conflict(error.message, error.code);
        }
        throw error;
    }

    return context.json({
        success: true,
        data: {
            tenant_id: result.tenant.id,
            tenant: result.tenant.name,
            mapping_id: mapping.id,
            username: result.user.auth,
        },
    });
}

async function verifyRegistrationToken(context: Context): Promise<VerifiedAuth0Identity> {
    const authHeader = context.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw HttpErrors.unauthorized('Authorization bearer token required', 'AUTH_TOKEN_REQUIRED');
    }

    const token = authHeader.substring(7);
    try {
        const verifier = auth0VerifierFactory ? auth0VerifierFactory() : new Auth0Verifier();
        return await verifier.verifyAccessToken(token);
    } catch (error) {
        if (error instanceof Auth0ConfigError) {
            throw HttpErrors.unauthorized(error.message, error.code);
        }
        if (error instanceof Auth0VerificationError) {
            throw HttpErrors.unauthorized(error.message, error.code);
        }
        throw error;
    }
}

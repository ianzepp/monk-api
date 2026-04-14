import { HttpErrors } from '@src/lib/errors/http-error.js';

export interface Auth0BrokerConfig {
    issuer: string;
    domain: string;
    clientId: string;
    clientSecret: string;
    connection: string;
    audience?: string;
    managementClientId: string;
    managementClientSecret: string;
}

export interface Auth0BrokerRegisterResult {
    status: 'created' | 'existing';
}

export interface Auth0Broker {
    registerScopedIdentity(identity: string, email: string, password: string): Promise<Auth0BrokerRegisterResult>;
    authenticateScopedIdentity(identity: string, password: string): Promise<void>;
}

export class Auth0BrokerError extends Error {
    public readonly name = 'Auth0BrokerError';

    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode: number = 401
    ) {
        super(message);
        Object.setPrototypeOf(this, Auth0BrokerError.prototype);
    }
}

type Auth0BrokerFactory = () => Auth0Broker;

let auth0BrokerFactory: Auth0BrokerFactory | null = null;

const memoryBrokerUsers = new Map<string, string>();

export function setAuth0BrokerFactoryForTests(factory: Auth0BrokerFactory | null): void {
    auth0BrokerFactory = factory;
}

export function resetMemoryAuth0BrokerForTests(): void {
    memoryBrokerUsers.clear();
}

export function auth0ScopedIdentity(tenant: string, username: string): string {
    return `${tenant}:${username}`;
}

export function auth0BrokerFromEnv(): Auth0Broker {
    if (auth0BrokerFactory) {
        return auth0BrokerFactory();
    }

    if (process.env.AUTH0_BROKER_MODE === 'memory') {
        return new MemoryAuth0Broker();
    }

    return new HttpAuth0Broker(auth0BrokerConfigFromEnv());
}

export function auth0BrokerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Auth0BrokerConfig {
    const issuer = normalizeIssuer(env.AUTH0_ISSUER || domainToIssuer(env.AUTH0_DOMAIN));
    const domain = issuerToDomain(issuer);
    const clientId = env.AUTH0_CLIENT_ID?.trim();
    const clientSecret = env.AUTH0_CLIENT_SECRET?.trim();
    const connection = env.AUTH0_CONNECTION?.trim();
    const managementClientId = env.AUTH0_MANAGEMENT_CLIENT_ID?.trim() || clientId;
    const managementClientSecret = env.AUTH0_MANAGEMENT_CLIENT_SECRET?.trim() || clientSecret;
    const audience = env.AUTH0_AUDIENCE?.trim() || undefined;

    if (!issuer || !domain) {
        throw new Auth0BrokerError('AUTH0_ISSUER or AUTH0_DOMAIN is required', 'AUTH0_CONFIG_MISSING', 500);
    }
    if (!clientId || !clientSecret) {
        throw new Auth0BrokerError('AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET are required', 'AUTH0_CONFIG_MISSING', 500);
    }
    if (!connection) {
        throw new Auth0BrokerError('AUTH0_CONNECTION is required', 'AUTH0_CONFIG_MISSING', 500);
    }
    if (!managementClientId || !managementClientSecret) {
        throw new Auth0BrokerError(
            'AUTH0_MANAGEMENT_CLIENT_ID and AUTH0_MANAGEMENT_CLIENT_SECRET are required',
            'AUTH0_CONFIG_MISSING',
            500
        );
    }

    return {
        issuer,
        domain,
        clientId,
        clientSecret,
        connection,
        audience,
        managementClientId,
        managementClientSecret,
    };
}

class MemoryAuth0Broker implements Auth0Broker {
    async registerScopedIdentity(identity: string, _email: string, password: string): Promise<Auth0BrokerRegisterResult> {
        const existingPassword = memoryBrokerUsers.get(identity);
        if (existingPassword === undefined) {
            memoryBrokerUsers.set(identity, password);
            return { status: 'created' };
        }

        if (existingPassword !== password) {
            throw new Auth0BrokerError('Username already exists', 'AUTH_USERNAME_EXISTS', 409);
        }

        return { status: 'existing' };
    }

    async authenticateScopedIdentity(identity: string, password: string): Promise<void> {
        const existingPassword = memoryBrokerUsers.get(identity);
        if (existingPassword === undefined || existingPassword !== password) {
            throw new Auth0BrokerError('Authentication failed', 'AUTH_LOGIN_FAILED', 401);
        }
    }
}

class HttpAuth0Broker implements Auth0Broker {
    constructor(private readonly config: Auth0BrokerConfig) {}

    async registerScopedIdentity(identity: string, email: string, password: string): Promise<Auth0BrokerRegisterResult> {
        const managementToken = await this.fetchManagementToken();
        const response = await fetch(`${this.config.issuer}api/v2/users`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${managementToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connection: this.config.connection,
                username: identity,
                email,
                password,
                verify_email: false,
            }),
        });

        if (response.ok) {
            return { status: 'created' };
        }

        const body = await safeJson(response);
        const message = readAuth0Message(body);
        if (response.status === 409 || /already exists/i.test(message)) {
            await this.authenticateScopedIdentity(identity, password);
            return { status: 'existing' };
        }

        throw new Auth0BrokerError(
            message || 'Auth0 user provisioning failed',
            'AUTH0_REGISTER_FAILED',
            response.status || 502
        );
    }

    async authenticateScopedIdentity(identity: string, password: string): Promise<void> {
        const response = await fetch(`${this.config.issuer}oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                username: identity,
                password,
                realm: this.config.connection,
                ...(this.config.audience ? { audience: this.config.audience } : {}),
                scope: 'openid',
            }),
        });

        if (response.ok) {
            return;
        }

        const body = await safeJson(response);
        const message = readAuth0Message(body);
        if (response.status === 401 || response.status === 403) {
            throw new Auth0BrokerError('Authentication failed', 'AUTH_LOGIN_FAILED', 401);
        }

        throw new Auth0BrokerError(
            message || 'Auth0 credential verification failed',
            'AUTH0_LOGIN_FAILED',
            response.status || 502
        );
    }

    private async fetchManagementToken(): Promise<string> {
        const response = await fetch(`${this.config.issuer}oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'client_credentials',
                client_id: this.config.managementClientId,
                client_secret: this.config.managementClientSecret,
                audience: `${this.config.issuer}api/v2/`,
            }),
        });

        const body = await safeJson(response);
        if (!response.ok || typeof body.access_token !== 'string' || !body.access_token) {
            throw new Auth0BrokerError(
                readAuth0Message(body) || 'Unable to obtain Auth0 management token',
                'AUTH0_MANAGEMENT_TOKEN_FAILED',
                response.status || 502
            );
        }

        return body.access_token;
    }
}

async function safeJson(response: Response): Promise<Record<string, any>> {
    try {
        return await response.json() as Record<string, any>;
    } catch {
        return {};
    }
}

function readAuth0Message(body: Record<string, any>): string {
    const candidates = [body.message, body.error_description, body.error];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate;
        }
    }
    return '';
}

function normalizeIssuer(value: string | undefined): string {
    const issuer = value?.trim();
    if (!issuer) {
        return '';
    }
    return issuer.endsWith('/') ? issuer : `${issuer}/`;
}

function domainToIssuer(domain: string | undefined): string {
    const trimmed = domain?.trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
        return normalizeIssuer(trimmed);
    }
    return `https://${trimmed}/`;
}

function issuerToDomain(issuer: string): string {
    if (!issuer) {
        return '';
    }
    return new URL(issuer).host;
}

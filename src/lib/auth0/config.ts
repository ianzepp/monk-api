export const AUTH0_DEFAULT_ALGORITHM = 'RS256' as const;

export interface Auth0Config {
    issuer: string;
    audience: string;
    jwksUrl: string;
    algorithm: typeof AUTH0_DEFAULT_ALGORITHM;
}

export interface Auth0ConfigEnv {
    AUTH0_ISSUER?: string;
    AUTH0_AUDIENCE?: string;
    AUTH0_JWKS_URL?: string;
    AUTH0_DOMAIN?: string;
    AUTH0_ALGORITHM?: string;
    NODE_ENV?: string;
}

export class Auth0ConfigError extends Error {
    public readonly name = 'Auth0ConfigError';

    constructor(
        message: string,
        public readonly code: string
    ) {
        super(message);
        Object.setPrototypeOf(this, Auth0ConfigError.prototype);
    }
}

export function auth0ConfigFromEnv(env: Auth0ConfigEnv = process.env): Auth0Config {
    const issuer = normalizeIssuer(env.AUTH0_ISSUER || domainToIssuer(env.AUTH0_DOMAIN));
    const audience = env.AUTH0_AUDIENCE?.trim();
    const jwksUrl = env.AUTH0_JWKS_URL?.trim() || issuerToJwksUrl(issuer);
    const algorithm = env.AUTH0_ALGORITHM?.trim() || AUTH0_DEFAULT_ALGORITHM;

    if (!issuer) {
        throw new Auth0ConfigError('AUTH0_ISSUER or AUTH0_DOMAIN is required', 'AUTH0_CONFIG_MISSING');
    }
    if (!audience) {
        throw new Auth0ConfigError('AUTH0_AUDIENCE is required', 'AUTH0_CONFIG_MISSING');
    }
    if (!jwksUrl) {
        throw new Auth0ConfigError('AUTH0_JWKS_URL or AUTH0_DOMAIN is required', 'AUTH0_CONFIG_MISSING');
    }
    if (algorithm !== AUTH0_DEFAULT_ALGORITHM) {
        throw new Auth0ConfigError('Only RS256 Auth0 access tokens are supported', 'AUTH0_ALGORITHM_UNSUPPORTED');
    }

    return {
        issuer,
        audience,
        jwksUrl,
        algorithm: AUTH0_DEFAULT_ALGORITHM,
    };
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

function issuerToJwksUrl(issuer: string): string {
    if (!issuer) {
        return '';
    }
    return new URL('.well-known/jwks.json', issuer).toString();
}

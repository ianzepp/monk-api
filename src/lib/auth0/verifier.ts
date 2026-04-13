import { createPublicKey, createVerify, type KeyObject } from 'crypto';
import type { Auth0Config } from './config.js';
import { AUTH0_DEFAULT_ALGORITHM, auth0ConfigFromEnv } from './config.js';

export interface VerifiedAuth0Identity {
    iss: string;
    sub: string;
    aud: string | string[];
    iat?: number;
    exp?: number;
    kid: string;
    alg: typeof AUTH0_DEFAULT_ALGORITHM;
}

export interface Auth0VerifierOptions {
    config?: Auth0Config;
    jwksProvider?: () => Promise<JsonWebKeySet>;
    now?: () => number;
    cacheTtlMs?: number;
}

interface JsonWebKeySet {
    keys: Auth0Jwk[];
}

interface Auth0Jwk {
    kty?: string;
    kid?: string;
    [key: string]: unknown;
}

interface DecodedToken {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
    signingInput: string;
    signature: Buffer;
}

export class Auth0VerificationError extends Error {
    public readonly name = 'Auth0VerificationError';

    constructor(
        message: string,
        public readonly code: string
    ) {
        super(message);
        Object.setPrototypeOf(this, Auth0VerificationError.prototype);
    }
}

export class Auth0Verifier {
    private readonly config: Auth0Config;
    private readonly jwksProvider: () => Promise<JsonWebKeySet>;
    private readonly now: () => number;
    private readonly cacheTtlMs: number;
    private cachedJwks: JsonWebKeySet | null = null;
    private cachedAt = 0;
    private keyCache = new Map<string, KeyObject>();

    constructor(options: Auth0VerifierOptions = {}) {
        this.config = options.config || auth0ConfigFromEnv();
        this.jwksProvider = options.jwksProvider || (() => fetchJwks(this.config.jwksUrl));
        this.now = options.now || (() => Math.floor(Date.now() / 1000));
        this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60 * 1000;
    }

    async verifyAccessToken(token: string): Promise<VerifiedAuth0Identity> {
        const decoded = decodeJwt(token);
        const alg = readStringClaim(decoded.header, 'alg');
        const kid = readStringClaim(decoded.header, 'kid');

        if (alg !== this.config.algorithm) {
            throw new Auth0VerificationError('Unsupported Auth0 token algorithm', 'AUTH0_TOKEN_ALGORITHM_UNSUPPORTED');
        }
        if (!kid) {
            throw new Auth0VerificationError('Auth0 token is missing kid', 'AUTH0_TOKEN_KID_MISSING');
        }

        const key = await this.publicKeyForKid(kid);
        const isSignatureValid = createVerify('RSA-SHA256')
            .update(decoded.signingInput)
            .end()
            .verify(key, decoded.signature);

        if (!isSignatureValid) {
            throw new Auth0VerificationError('Invalid Auth0 token signature', 'AUTH0_TOKEN_SIGNATURE_INVALID');
        }

        const iss = readStringClaim(decoded.payload, 'iss');
        const sub = readStringClaim(decoded.payload, 'sub');
        const aud = decoded.payload.aud;
        const exp = readNumberClaim(decoded.payload, 'exp');
        const iat = readNumberClaim(decoded.payload, 'iat');
        const nbf = readNumberClaim(decoded.payload, 'nbf');
        const now = this.now();

        if (iss !== this.config.issuer) {
            throw new Auth0VerificationError('Invalid Auth0 token issuer', 'AUTH0_TOKEN_ISSUER_INVALID');
        }
        if (!audienceIncludes(aud, this.config.audience)) {
            throw new Auth0VerificationError('Invalid Auth0 token audience', 'AUTH0_TOKEN_AUDIENCE_INVALID');
        }
        if (!sub) {
            throw new Auth0VerificationError('Auth0 token is missing subject', 'AUTH0_TOKEN_SUB_MISSING');
        }
        if (exp === undefined || exp <= now) {
            throw new Auth0VerificationError('Auth0 token has expired', 'AUTH0_TOKEN_EXPIRED');
        }
        if (nbf !== undefined && nbf > now) {
            throw new Auth0VerificationError('Auth0 token is not yet valid', 'AUTH0_TOKEN_NOT_YET_VALID');
        }

        return {
            iss,
            sub,
            aud: aud as string | string[],
            iat,
            exp,
            kid,
            alg: AUTH0_DEFAULT_ALGORITHM,
        };
    }

    clearCache(): void {
        this.cachedJwks = null;
        this.cachedAt = 0;
        this.keyCache.clear();
    }

    private async publicKeyForKid(kid: string): Promise<KeyObject> {
        const cachedKey = this.keyCache.get(kid);
        if (cachedKey) {
            return cachedKey;
        }

        const jwks = await this.getJwks();
        const jwk = jwks.keys.find((key) => key.kid === kid);
        if (!jwk) {
            throw new Auth0VerificationError('Auth0 JWKS does not contain token kid', 'AUTH0_JWKS_KEY_NOT_FOUND');
        }
        if (jwk.kty !== 'RSA') {
            throw new Auth0VerificationError('Auth0 JWKS key is not RSA', 'AUTH0_JWKS_KEY_UNSUPPORTED');
        }

        const key = createPublicKey({ key: jwk as any, format: 'jwk' });
        this.keyCache.set(kid, key);
        return key;
    }

    private async getJwks(): Promise<JsonWebKeySet> {
        const ageMs = Date.now() - this.cachedAt;
        if (this.cachedJwks && ageMs < this.cacheTtlMs) {
            return this.cachedJwks;
        }

        const jwks = await this.jwksProvider();
        if (!jwks.keys || !Array.isArray(jwks.keys)) {
            throw new Auth0VerificationError('Invalid Auth0 JWKS response', 'AUTH0_JWKS_INVALID');
        }

        this.cachedJwks = jwks;
        this.cachedAt = Date.now();
        this.keyCache.clear();
        return jwks;
    }
}

export async function verifyAuth0AccessToken(
    token: string,
    options: Auth0VerifierOptions = {}
): Promise<VerifiedAuth0Identity> {
    return new Auth0Verifier(options).verifyAccessToken(token);
}

async function fetchJwks(jwksUrl: string): Promise<JsonWebKeySet> {
    const response = await fetch(jwksUrl);
    if (!response.ok) {
        throw new Auth0VerificationError('Unable to fetch Auth0 JWKS', 'AUTH0_JWKS_FETCH_FAILED');
    }
    return await response.json() as JsonWebKeySet;
}

function decodeJwt(token: string): DecodedToken {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) {
        throw new Auth0VerificationError('Malformed Auth0 token', 'AUTH0_TOKEN_MALFORMED');
    }

    try {
        return {
            header: JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as Record<string, unknown>,
            payload: JSON.parse(base64UrlDecode(parts[1]).toString('utf8')) as Record<string, unknown>,
            signingInput: `${parts[0]}.${parts[1]}`,
            signature: base64UrlDecode(parts[2]),
        };
    } catch {
        throw new Auth0VerificationError('Malformed Auth0 token', 'AUTH0_TOKEN_MALFORMED');
    }
}

function base64UrlDecode(value: string): Buffer {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return Buffer.from(padded, 'base64');
}

function readStringClaim(source: Record<string, unknown>, claim: string): string {
    const value = source[claim];
    return typeof value === 'string' ? value : '';
}

function readNumberClaim(source: Record<string, unknown>, claim: string): number | undefined {
    const value = source[claim];
    return typeof value === 'number' ? value : undefined;
}

function audienceIncludes(aud: unknown, expectedAudience: string): boolean {
    if (typeof aud === 'string') {
        return aud === expectedAudience;
    }
    if (Array.isArray(aud)) {
        return aud.includes(expectedAudience);
    }
    return false;
}

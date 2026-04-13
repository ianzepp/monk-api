import { describe, expect, it } from 'bun:test';
import { createHmac, createSign, generateKeyPairSync, type KeyObject } from 'crypto';
import { Auth0Verifier, Auth0VerificationError, type Auth0Config } from '@src/lib/auth0/index.js';

const ISSUER = 'https://monk-test.us.auth0.com/';
const AUDIENCE = 'https://api.monk.test';
const KID = 'monk-test-key';
const NOW = 1_800_000_000;

const config: Auth0Config = {
    issuer: ISSUER,
    audience: AUDIENCE,
    jwksUrl: `${ISSUER}.well-known/jwks.json`,
    algorithm: 'RS256',
};

const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
});

const publicJwk = {
    ...keyPair.publicKey.export({ format: 'jwk' }),
    kid: KID,
    use: 'sig',
    alg: 'RS256',
};

function verifier() {
    return new Auth0Verifier({
        config,
        now: () => NOW,
        jwksProvider: async () => ({ keys: [publicJwk] }),
    });
}

describe('Auth0Verifier', () => {
    it('returns verified issuer and subject for a valid Auth0 access token', async () => {
        const token = signRs256({
            iss: ISSUER,
            sub: 'auth0|user_123',
            aud: AUDIENCE,
            iat: NOW - 60,
            exp: NOW + 600,
            permissions: ['ignored:claim'],
            tenant: 'ignored-tenant',
            db: 'ignored-db',
            ns: 'ignored-ns',
        });

        const identity = await verifier().verifyAccessToken(token);

        expect(identity).toEqual({
            iss: ISSUER,
            sub: 'auth0|user_123',
            aud: AUDIENCE,
            iat: NOW - 60,
            exp: NOW + 600,
            kid: KID,
            alg: 'RS256',
        });
        expect(identity).not.toHaveProperty('permissions');
        expect(identity).not.toHaveProperty('tenant');
        expect(identity).not.toHaveProperty('db');
        expect(identity).not.toHaveProperty('ns');
    });

    it('rejects a bad issuer with a stable auth error code', async () => {
        const token = signRs256({
            iss: 'https://evil.example/',
            sub: 'auth0|user_123',
            aud: AUDIENCE,
            exp: NOW + 600,
        });

        await expectAuth0Error(token, 'AUTH0_TOKEN_ISSUER_INVALID');
    });

    it('rejects a bad audience with a stable auth error code', async () => {
        const token = signRs256({
            iss: ISSUER,
            sub: 'auth0|user_123',
            aud: 'https://other-api.test',
            exp: NOW + 600,
        });

        await expectAuth0Error(token, 'AUTH0_TOKEN_AUDIENCE_INVALID');
    });

    it('rejects an expired token with a stable auth error code', async () => {
        const token = signRs256({
            iss: ISSUER,
            sub: 'auth0|user_123',
            aud: AUDIENCE,
            exp: NOW - 1,
        });

        await expectAuth0Error(token, 'AUTH0_TOKEN_EXPIRED');
    });

    it('rejects an invalid signature with a stable auth error code', async () => {
        const token = signRs256({
            iss: ISSUER,
            sub: 'auth0|user_123',
            aud: AUDIENCE,
            exp: NOW + 600,
        });
        const parts = token.split('.');
        const tamperedPayload = base64UrlEncode(JSON.stringify({
            iss: ISSUER,
            sub: 'auth0|attacker',
            aud: AUDIENCE,
            exp: NOW + 600,
        }));

        await expectAuth0Error(`${parts[0]}.${tamperedPayload}.${parts[2]}`, 'AUTH0_TOKEN_SIGNATURE_INVALID');
    });

    it('rejects the wrong algorithm before using JWKS claims', async () => {
        const token = signHs256({
            iss: ISSUER,
            sub: 'auth0|user_123',
            aud: AUDIENCE,
            exp: NOW + 600,
        });

        await expectAuth0Error(token, 'AUTH0_TOKEN_ALGORITHM_UNSUPPORTED');
    });
});

async function expectAuth0Error(token: string, code: string) {
    try {
        await verifier().verifyAccessToken(token);
        throw new Error('Expected Auth0 verification to fail');
    } catch (error) {
        expect(error).toBeInstanceOf(Auth0VerificationError);
        expect((error as Auth0VerificationError).code).toBe(code);
    }
}

function signRs256(payload: Record<string, unknown>, header: Record<string, unknown> = {}): string {
    const encodedHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID, ...header }));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = createSign('RSA-SHA256')
        .update(signingInput)
        .end()
        .sign(keyPair.privateKey as KeyObject);

    return `${signingInput}.${base64UrlEncode(signature)}`;
}

function signHs256(payload: Record<string, unknown>): string {
    const encodedHeader = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: KID }));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', 'not-an-auth0-secret')
        .update(signingInput)
        .digest();

    return `${signingInput}.${base64UrlEncode(signature)}`;
}

function base64UrlEncode(value: string | Buffer): string {
    return Buffer.from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

import { describe, expect, it } from 'bun:test';
import { generateKeyPairSync, sign } from 'crypto';
import { HttpClient } from '../http-client.js';
import { TEST_CONFIG } from '../test-config.js';

function createEd25519KeyPair() {
    return generateKeyPairSync('ed25519');
}

function createRsaKeyPair() {
    return generateKeyPairSync('rsa', { modulusLength: 2048 });
}

function signNonce(nonce: string, privateKey: CryptoKey | any): string {
    return sign(null, Buffer.from(nonce, 'utf8'), privateKey).toString('base64url');
}

describe('Public-key auth flow', () => {
    it('provisions, verifies, rejects challenge replay, and lists fingerprint-first keys', async () => {
        const tenant = `pk_auth_${Date.now()}`;
        const username = 'root_agent';
        const client = new HttpClient(TEST_CONFIG.API_URL);
        const pair = createEd25519KeyPair();
        const publicKeyPem = pair.publicKey.export({ format: 'pem', type: 'spki' }).toString();

        const provision = await client.post('/auth/provision', {
            tenant,
            username,
            public_key: publicKeyPem,
            algorithm: 'ed25519',
            key_name: 'builder-1',
        });

        expect(provision.success).toBe(true);
        expect(provision.data.tenant).toBe(tenant);
        expect(provision.data.user.username).toBe(username);
        expect(provision.data.challenge.nonce).toBeDefined();
        expect(provision.data.key.fingerprint).toMatch(/^fp_/);

        const verifyResponse = await client.post('/auth/verify', {
            tenant,
            challenge_id: provision.data.challenge.challenge_id,
            signature: signNonce(provision.data.challenge.nonce, pair.privateKey),
        });

        expect(verifyResponse.success).toBe(true);
        expect(verifyResponse.data.token).toBeDefined();
        expect(verifyResponse.data.key_id).toBe(provision.data.key.id);

        const replay = await client.post('/auth/verify', {
            tenant,
            challenge_id: provision.data.challenge.challenge_id,
            signature: signNonce(provision.data.challenge.nonce, pair.privateKey),
        });
        expect(replay.success).toBe(false);
        expect(replay.error_code).toBe('AUTH_CHALLENGE_INVALID');

        client.setAuthToken(verifyResponse.data.token);
        const listedKeys = await client.get('/api/keys');
        expect(listedKeys.success).toBe(true);
        expect(Array.isArray(listedKeys.data)).toBe(true);
        expect(listedKeys.data[0].fingerprint).toBe(provision.data.key.fingerprint);
        expect(listedKeys.data[0].public_key).toBeUndefined();
    });

    it('adds, rotates, and revokes tenant keys through /api/keys', async () => {
        const tenant = `pk_keys_${Date.now()}`;
        const username = 'root_agent';
        const client = new HttpClient(TEST_CONFIG.API_URL);

        const bootstrapPair = createEd25519KeyPair();
        const bootstrapPublicKey = bootstrapPair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
        const provision = await client.post('/auth/provision', {
            tenant,
            username,
            public_key: bootstrapPublicKey,
            algorithm: 'ed25519',
            key_name: 'bootstrap',
        });
        const rootUserId = provision.data.user.id;

        const verifyResponse = await client.post('/auth/verify', {
            tenant,
            challenge_id: provision.data.challenge.challenge_id,
            signature: signNonce(provision.data.challenge.nonce, bootstrapPair.privateKey),
        });
        client.setAuthToken(verifyResponse.data.token);

        const addedPair = createEd25519KeyPair();
        const addResponse = await client.post('/api/keys', {
            user_id: rootUserId,
            public_key: addedPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            algorithm: 'ed25519',
            name: 'runtime-2',
        });
        if (!addResponse.success) {
            throw new Error(`add key failed: ${JSON.stringify(addResponse)}`);
        }
        expect(addResponse.success).toBe(true);
        expect(addResponse.data.fingerprint).toMatch(/^fp_/);

        const rotatedPair = createEd25519KeyPair();
        const rotateResponse = await client.post('/api/keys/rotate', {
            key_id: addResponse.data.id,
            new_public_key: rotatedPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            algorithm: 'ed25519',
            new_name: 'runtime-2-rotated',
            revoke_old_after_seconds: 300,
        });
        expect(rotateResponse.success).toBe(true);
        expect(rotateResponse.data.old_key_id).toBe(addResponse.data.id);
        expect(rotateResponse.data.new_key_id).toBeDefined();

        const revokeResponse = await client.delete(`/api/keys/${rotateResponse.data.old_key_id}`);
        expect(revokeResponse.success).toBe(true);
        expect(revokeResponse.data.revoked).toBe(true);
    });

    it('rejects refresh for machine tokens and rejects revoked-key tokens on protected routes', async () => {
        const tenant = `pk_revoke_${Date.now()}`;
        const username = 'root_agent';
        const client = new HttpClient(TEST_CONFIG.API_URL);

        const bootstrapPair = createEd25519KeyPair();
        const bootstrapPublicKey = bootstrapPair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
        const provision = await client.post('/auth/provision', {
            tenant,
            username,
            public_key: bootstrapPublicKey,
            algorithm: 'ed25519',
            key_name: 'bootstrap',
        });
        const rootUserId = provision.data.user.id;

        const bootstrapVerify = await client.post('/auth/verify', {
            tenant,
            challenge_id: provision.data.challenge.challenge_id,
            signature: signNonce(provision.data.challenge.nonce, bootstrapPair.privateKey),
        });
        expect(bootstrapVerify.success).toBe(true);

        client.setAuthToken(bootstrapVerify.data.token);

        const runtimePair = createEd25519KeyPair();
        const addResponse = await client.post('/api/keys', {
            user_id: rootUserId,
            public_key: runtimePair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            algorithm: 'ed25519',
            name: 'runtime',
        });
        expect(addResponse.success).toBe(true);

        const runtimeChallenge = await client.post('/auth/challenge', {
            tenant,
            key_id: addResponse.data.id,
        });
        expect(runtimeChallenge.success).toBe(true);

        const runtimeVerify = await client.post('/auth/verify', {
            tenant,
            challenge_id: runtimeChallenge.data.challenge_id,
            signature: signNonce(runtimeChallenge.data.nonce, runtimePair.privateKey),
        });
        expect(runtimeVerify.success).toBe(true);

        const machineClient = new HttpClient(TEST_CONFIG.API_URL, runtimeVerify.data.token);
        const refreshResponse = await machineClient.post('/auth/refresh');
        expect(refreshResponse.success).toBe(false);
        expect(refreshResponse.error_code).toBe('AUTH_PUBLIC_KEY_REFRESH_UNSUPPORTED');

        const revokeResponse = await machineClient.delete(`/api/keys/${addResponse.data.id}`);
        expect(revokeResponse.success).toBe(true);

        const protectedResponse = await machineClient.get('/api/keys');
        expect(protectedResponse.success).toBe(false);
        expect(protectedResponse.error_code).toBe('AUTH_KEY_REVOKED');
    });

    it('rejects verify when the key expires after challenge issuance', async () => {
        const tenant = `pk_expire_${Date.now()}`;
        const username = 'root_agent';
        const client = new HttpClient(TEST_CONFIG.API_URL);

        const bootstrapPair = createEd25519KeyPair();
        const provision = await client.post('/auth/provision', {
            tenant,
            username,
            public_key: bootstrapPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            algorithm: 'ed25519',
            key_name: 'bootstrap',
        });
        const rootUserId = provision.data.user.id;

        const bootstrapVerify = await client.post('/auth/verify', {
            tenant,
            challenge_id: provision.data.challenge.challenge_id,
            signature: signNonce(provision.data.challenge.nonce, bootstrapPair.privateKey),
        });
        expect(bootstrapVerify.success).toBe(true);
        client.setAuthToken(bootstrapVerify.data.token);

        const expiringPair = createEd25519KeyPair();
        const addResponse = await client.post('/api/keys', {
            user_id: rootUserId,
            public_key: expiringPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            algorithm: 'ed25519',
            name: 'expiring',
            expires_at: new Date(Date.now() + 500).toISOString(),
        });
        expect(addResponse.success).toBe(true);

        const challengeResponse = await client.post('/auth/challenge', {
            tenant,
            key_id: addResponse.data.id,
        });
        expect(challengeResponse.success).toBe(true);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const verifyResponse = await client.post('/auth/verify', {
            tenant,
            challenge_id: challengeResponse.data.challenge_id,
            signature: signNonce(challengeResponse.data.nonce, expiringPair.privateKey),
        });
        expect(verifyResponse.success).toBe(false);
        expect(verifyResponse.error_code).toBe('AUTH_KEY_EXPIRED');
    });

    it('rejects non-ed25519 public keys for the ed25519 flow', async () => {
        const tenant = `pk_rsa_${Date.now()}`;
        const pair = createRsaKeyPair();
        const client = new HttpClient(TEST_CONFIG.API_URL);

        const response = await client.post('/auth/provision', {
            tenant,
            username: 'root_agent',
            public_key: pair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            algorithm: 'ed25519',
            key_name: 'rsa-should-fail',
        });

        expect(response.success).toBe(false);
        expect(response.error_code).toBe('AUTH_PUBLIC_KEY_INVALID');
    });
});

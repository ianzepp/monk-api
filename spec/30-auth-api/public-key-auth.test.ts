import { describe, expect, it } from 'bun:test';
import { generateKeyPairSync, sign } from 'crypto';
import { HttpClient } from '../http-client.js';
import { TEST_CONFIG } from '../test-config.js';

function createEd25519KeyPair() {
    return generateKeyPairSync('ed25519');
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
});

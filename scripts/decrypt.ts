#!/usr/bin/env bun
/**
 * Decrypt Monk API Encrypted Responses
 *
 * Decrypts responses encrypted with ?encrypt=pgp parameter.
 * Requires the same JWT token that was used for encryption.
 *
 * Usage:
 *   bun scripts/decrypt.ts <jwt-token> < encrypted-message.txt
 *   bun scripts/decrypt.ts <jwt-token> encrypted-message.txt
 *
 * Example:
 *   # From stdin
 *   curl /api/user/me?encrypt=pgp -H "Authorization: Bearer $JWT" | bun scripts/decrypt.ts "$JWT"
 *
 *   # From file
 *   bun scripts/decrypt.ts "$JWT" encrypted-response.txt
 *
 * Security Model:
 * - JWT token is the decryption key
 * - Same JWT used for encryption must be used for decryption
 * - JWT expiry means old encrypted messages become undecryptable
 */

import { createDecipheriv } from 'crypto';
import { readFileSync } from 'fs';
import { pbkdf2Sync } from 'crypto';

interface ArmorComponents {
    iv: Buffer;
    ciphertext: Buffer;
    authTag: Buffer;
}

interface JWTPayload {
    tenant: string;
    id?: string;
    user?: string;
}

/**
 * Parse ASCII armor to extract encrypted components
 */
function parseArmor(armored: string): ArmorComponents {
    const lines = armored.split('\n').map(l => l.trim());

    // Find begin/end markers
    const beginIndex = lines.findIndex(l => l.startsWith('-----BEGIN MONK ENCRYPTED MESSAGE-----'));
    const endIndex = lines.findIndex(l => l.startsWith('-----END MONK ENCRYPTED MESSAGE-----'));

    if (beginIndex === -1 || endIndex === -1) {
        throw new Error('Invalid armor format: missing BEGIN or END markers');
    }

    // Extract base64 data (skip headers)
    let dataStartIndex = beginIndex + 1;
    for (let i = beginIndex + 1; i < endIndex; i++) {
        if (lines[i] === '') {
            dataStartIndex = i + 1;
            break;
        }
    }

    const dataLines = lines.slice(dataStartIndex, endIndex);
    const base64 = dataLines.join('');

    // Decode base64
    const combined = Buffer.from(base64, 'base64');

    // Extract components: IV (12) + ciphertext + authTag (16)
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(-16);
    const ciphertext = combined.subarray(12, -16);

    return { iv, ciphertext, authTag };
}

/**
 * Derive encryption key from JWT token
 * Must match server-side key derivation
 */
function deriveKeyFromJWT(jwt: string, salt: string): Buffer {
    return pbkdf2Sync(
        jwt,       // Password: JWT token
        salt,      // Salt: tenant:userId
        100000,    // Iterations (must match server)
        32,        // Key length: 256 bits
        'sha256'   // Hash algorithm
    );
}

/**
 * Extract salt from JWT payload
 * Decodes JWT to get tenant and user ID
 */
function extractSaltFromJWT(jwt: string): string {
    try {
        // JWT format: header.payload.signature
        const parts = jwt.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }

        // Decode payload (base64url)
        const payload: JWTPayload = JSON.parse(
            Buffer.from(parts[1], 'base64url').toString('utf8')
        );

        const tenant = payload.tenant;
        const userId = payload.id || payload.user;

        if (!tenant || !userId) {
            throw new Error('JWT missing tenant or user ID');
        }

        return `${tenant}:${userId}`;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to extract salt from JWT: ${message}`);
    }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
function decrypt(iv: Buffer, ciphertext: Buffer, authTag: Buffer, key: Buffer): string {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);

    return plaintext.toString('utf8');
}

/**
 * Main decryption function
 */
function main(): void {
    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: bun scripts/decrypt.ts <jwt-token> [encrypted-file]');
        console.error('');
        console.error('Examples:');
        console.error('  bun scripts/decrypt.ts "$JWT" < encrypted.txt');
        console.error('  bun scripts/decrypt.ts "$JWT" encrypted.txt');
        console.error('  curl /api/user/me?encrypt=pgp | bun scripts/decrypt.ts "$JWT"');
        process.exit(1);
    }

    const jwt = args[0];
    const inputFile = args[1];

    try {
        // Read encrypted message
        let encrypted: string;
        if (inputFile) {
            encrypted = readFileSync(inputFile, 'utf8');
        } else {
            encrypted = readFileSync(0, 'utf8'); // stdin
        }

        // Parse ASCII armor
        const { iv, ciphertext, authTag } = parseArmor(encrypted);

        // Extract salt from JWT
        const salt = extractSaltFromJWT(jwt);

        // Derive encryption key
        const key = deriveKeyFromJWT(jwt, salt);

        // Decrypt
        const plaintext = decrypt(iv, ciphertext, authTag, key);

        // Output plaintext
        console.log(plaintext);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Decryption failed:', message);
        process.exit(1);
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { parseArmor, deriveKeyFromJWT, extractSaltFromJWT, decrypt };

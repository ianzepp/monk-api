/**
 * Response Pipeline Middleware
 *
 * Single middleware that orchestrates all response transformations in a predetermined order.
 * Replaces the complex override-stacking approach with a clean, linear pipeline.
 *
 * Pipeline Order:
 * 1. Field Extraction - Apply ?unwrap, ?select=, ?stat=false, ?access=false
 * 2. Format Conversion - Convert to JSON/YAML/CSV/TOON/etc based on ?format=
 * 3. Encryption - Encrypt formatted text if ?encrypt=pgp
 *
 * Architecture:
 * - Overrides context.json() ONCE before route handlers run
 * - When routes call context.json(data), pipeline processes the data
 * - Returns final formatted/encrypted response
 * - No response cloning, no re-parsing, no multiple overrides
 *
 * Edge Cases Handled:
 * - Direct text responses (docs) - Skip pipeline, use original context.text()
 * - Error responses - Go through full pipeline (format + encrypt)
 * - Primitive values - Pass through without processing
 * - Missing dependencies (JWT for encryption) - Graceful fallback
 */

import type { Context, Next } from 'hono';
import type { JWTPayload } from '@src/lib/jwt-interface.js';
import type { ResponseFormat } from './format-detection.js';

// Field extraction utilities
import { extract } from '@src/lib/field-extractor.js';
import { filterSystemFields } from '@src/lib/system-field-filter.js';

// Formatters
import {
    JsonFormatter,
    ToonFormatter,
    YamlFormatter,
    TomlFormatter,
    CsvFormatter,
    MessagePackFormatter,
    BrainfuckFormatter,
    MorseFormatter,
    QrFormatter,
    MarkdownFormatter
} from '@src/lib/formatters/index.js';

// Encryption utilities
import { deriveKeyFromJWT, extractSaltFromPayload } from '@src/lib/encryption/key-derivation.js';
import { encrypt } from '@src/lib/encryption/aes-gcm.js';
import { createArmor } from '@src/lib/encryption/pgp-armor.js';

/**
 * Pipeline Step 1: Field Extraction
 *
 * Applies server-side field extraction and system field filtering:
 * - ?unwrap - Remove envelope, return data object
 * - ?select=id,name - Remove envelope, return specific fields
 * - ?stat=false - Exclude timestamp fields
 * - ?access=false - Exclude ACL fields
 *
 * Only processes successful responses (success: true)
 */
function applyFieldExtraction(data: any, context: Context): any {
    // Only process successful responses with envelope structure
    if (!data || typeof data !== 'object' || data.success !== true) {
        return data;
    }

    // Query options
    const unwrapParam = context.req.query('unwrap');
    const selectParam = context.req.query('select');
    const statParam = context.req.query('stat');
    const accessParam = context.req.query('access');

    // Define the result, while injecting the HTTP method, path, stat, and access
    let result = {
        success: true,
        method: context.req.method,
        path: context.req.path,
        stat: statParam,
        access: accessParam,
        ...data
    };

    // Step 1a: System field filtering (applied to data before unwrap/select)
    if (statParam === 'false' || accessParam === 'false') {
        const includeStat = statParam !== 'false';
        const includeAccess = accessParam !== 'false';

        if (result.data !== undefined) {
            result.data = filterSystemFields(result.data, includeStat, includeAccess);
        }
    }

    // Step 1b: Unwrap or select fields
    if (selectParam && selectParam.trim() !== '') {
        // select= implies unwrap + field filtering
        // Prepend "data." to each path since select operates within data scope
        const paths = (selectParam as string)
            .split(',')
            .map(p => `data.${p.trim()}`)
            .join(',');
        result = extract(result, paths);
    } else if (unwrapParam !== undefined) {
        // unwrap without select = return full data object
        result = extract(result, 'data');
    }

    // Convert undefined to null (undefined is not valid JSON)
    return result === undefined ? null : result;
}

/**
 * Pipeline Step 2: Format Conversion
 *
 * Converts data to string in requested format:
 * - JSON (default)
 * - TOON, YAML, TOML, CSV
 * - MessagePack, Brainfuck, Morse, QR, Markdown
 *
 * Returns { text, contentType } for next pipeline step
 */
function applyFormatter(data: any, context: Context): { text: string; contentType: string } {
    const format = (context.get('responseFormat') as ResponseFormat) || 'json';

    try {
        switch (format) {
            case 'json':
                return {
                    text: JSON.stringify(data, null, 2),
                    contentType: JsonFormatter.contentType
                };

            case 'toon':
                return {
                    text: ToonFormatter.encode(data),
                    contentType: ToonFormatter.contentType
                };

            case 'yaml':
                return {
                    text: YamlFormatter.encode(data),
                    contentType: YamlFormatter.contentType
                };

            case 'toml':
                return {
                    text: TomlFormatter.encode(data),
                    contentType: TomlFormatter.contentType
                };

            case 'csv':
                // CSV automatically unwraps envelope
                let csvData = data;
                if (data && typeof data === 'object' && 'data' in data) {
                    csvData = data.data;
                }
                return {
                    text: CsvFormatter.encode(csvData),
                    contentType: CsvFormatter.contentType
                };

            case 'msgpack':
                return {
                    text: MessagePackFormatter.encode(data),
                    contentType: MessagePackFormatter.contentType
                };

            case 'brainfuck':
                return {
                    text: BrainfuckFormatter.encode(data),
                    contentType: BrainfuckFormatter.contentType
                };

            case 'morse':
                return {
                    text: MorseFormatter.encode(data),
                    contentType: MorseFormatter.contentType
                };

            case 'qr':
                return {
                    text: QrFormatter.encode(data),
                    contentType: QrFormatter.contentType
                };

            case 'markdown':
                return {
                    text: MarkdownFormatter.encode(data),
                    contentType: MarkdownFormatter.contentType
                };

            default:
                // Fallback to JSON for unknown formats
                console.warn(`Unknown format '${format}', falling back to JSON`);
                return {
                    text: JSON.stringify(data, null, 2),
                    contentType: JsonFormatter.contentType
                };
        }
    } catch (error) {
        // If formatting fails, gracefully fall back to JSON
        console.error(`Format encoding failed (${format}), falling back to JSON:`, error);
        return {
            text: JSON.stringify(data, null, 2),
            contentType: JsonFormatter.contentType
        };
    }
}

/**
 * Pipeline Step 3: Encryption (Optional)
 *
 * Encrypts formatted text if ?encrypt=pgp is present:
 * - Derives encryption key from JWT token using PBKDF2
 * - Encrypts with AES-256-GCM
 * - Returns PGP-style ASCII armor
 *
 * Security Model:
 * - JWT token IS the decryption key
 * - Same JWT = same key (allows decryption)
 * - JWT expiry = old encrypted messages undecryptable
 * - Purpose: Transport security, not long-term storage
 *
 * Encrypts ALL responses including errors (prevents info leakage)
 */
function applyEncryption(text: string, context: Context): string {
    const encryptParam = context.req.query('encrypt');

    if (encryptParam !== 'pgp') {
        return text; // No encryption requested
    }

    try {
        // Extract JWT token from Authorization header
        const authHeader = context.req.header('Authorization');
        if (!authHeader) {
            throw new Error('Encryption requires authentication - missing Authorization header');
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            throw new Error('Encryption requires authentication - invalid Authorization header format');
        }

        const jwt = parts[1];

        // Get JWT payload from context (set by jwtValidationMiddleware)
        const jwtPayload = context.get('jwtPayload') as JWTPayload | undefined;
        if (!jwtPayload) {
            throw new Error('Encryption requires valid JWT payload - token not decoded');
        }

        // Derive encryption key from JWT token
        const salt = extractSaltFromPayload(jwtPayload);
        const key = deriveKeyFromJWT(jwt, salt);

        // Encrypt the formatted text
        const encryptionResult = encrypt(text, key);

        // Create PGP-style ASCII armor
        const armored = createArmor(encryptionResult);

        return armored;
    } catch (error) {
        // Encryption failed - log error and return unencrypted
        // This allows the API to remain functional even if encryption fails
        console.error('Encryption failed, returning unencrypted response:', error);
        return text;
    }
}

/**
 * Response Pipeline Middleware
 *
 * Single point of interception for all JSON responses.
 * Runs transformation pipeline: extract → format → encrypt
 *
 * Routes call context.json(data) as normal, pipeline handles the rest.
 */
export async function responsePipelineMiddleware(context: Context, next: Next) {
    // Store original methods
    const originalJson = context.json.bind(context);
    const originalText = context.text.bind(context);

    // Override context.json() to intercept ALL JSON responses
    context.json = function (data: any, init?: any) {
        // Only process object responses (skip primitives, null, undefined)
        // This allows routes to return simple values if needed
        const shouldProcess = data && typeof data === 'object';
        if (!shouldProcess) {
            return originalJson(data, init);
        }

        // ========== PIPELINE START ==========

        let result = data;

        // Step 1: Field Extraction (?unwrap, ?select=, ?stat=false, ?access=false)
        result = applyFieldExtraction(result, context);

        // Step 2: Format Conversion (?format=yaml|csv|toon|etc)
        const { text, contentType } = applyFormatter(result, context);

        // Step 3: Encryption (?encrypt=pgp)
        const finalText = applyEncryption(text, context);

        // ========== PIPELINE END ==========

        // Determine final content type and headers
        const isEncrypted = context.req.query('encrypt') === 'pgp';
        const finalContentType = isEncrypted ? 'text/plain; charset=utf-8' : contentType;

        const headers: Record<string, string> = {
            'Content-Type': finalContentType
        };

        if (isEncrypted) {
            headers['X-Monk-Encrypted'] = 'pgp';
            headers['X-Monk-Cipher'] = 'AES-256-GCM';
        }

        // Extract status code
        const status = typeof init === 'number' ? init : init?.status || 200;

        // Return final response using original text method
        return originalText(finalText, status, headers);
    } as any; // Type assertion needed for Hono method override

    // Execute route handlers
    await next();
}

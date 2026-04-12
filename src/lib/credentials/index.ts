/**
 * Credentials Management
 *
 * Utilities for password hashing and API key management.
 */

export { hashPassword, verifyPassword, needsRehash } from './password.js';
export {
    generateApiKey,
    hashApiKey,
    parseApiKey,
    isValidApiKeyFormat,
    verifyApiKey,
    type ApiKeyEnvironment,
    type GeneratedApiKey,
    type ParsedApiKey,
} from './api-key.js';
export {
    listKeys,
    addApiKey,
    removeKey,
    touchKey,
    type KeyType,
    type KeyRecord,
    type AddApiKeyOptions,
    type AddApiKeyResult,
} from './keys.js';

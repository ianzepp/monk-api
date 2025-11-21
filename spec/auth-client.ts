/**
 * Authentication Client
 *
 * High-level client for authentication operations that wraps HttpClient
 * and automatically manages JWT tokens.
 *
 * Features:
 * - login() - Authenticate with username/tenant
 * - register() - Create new tenant and authenticate
 * - Automatically caches JWT token in HttpClient
 * - Provides access to underlying HttpClient for API requests
 */

import { HttpClient } from './http-client.js';
import { TEST_CONFIG } from './test-config.js';

/**
 * Login credentials
 */
export interface LoginCredentials {
    tenant: string;
    username: string;
}

/**
 * Registration parameters
 */
export interface RegistrationParams {
    tenant: string;
    template?: string;
    username?: string;
    database?: string;
    description?: string;
}

/**
 * Authentication response (success or error)
 */
export interface AuthResponse {
    success: boolean;
    error?: string;
    error_code?: string;
    data?: {
        tenant: string;
        database: string;
        username: string;
        token: string;
        expires_in: number;
    };
}

/**
 * Authentication Client
 *
 * Wraps authentication operations and automatically manages JWT tokens.
 */
export class AuthClient {
    private httpClient: HttpClient;

    /**
     * Create a new AuthClient
     *
     * @param baseUrl - API base URL (default: TEST_CONFIG.API_URL)
     */
    constructor(baseUrl: string = TEST_CONFIG.API_URL) {
        this.httpClient = new HttpClient(baseUrl);
    }

    /**
     * Login to an existing tenant
     *
     * Automatically caches the JWT token for subsequent requests.
     *
     * @param credentials - Login credentials (tenant, username)
     * @returns Promise with authentication response
     *
     * @example
     * ```typescript
     * const authClient = new AuthClient();
     * const response = await authClient.login({
     *     tenant: 'my-tenant',
     *     username: 'admin'
     * });
     *
     * // Token is now cached - use httpClient for authenticated requests
     * const data = await authClient.httpClient.get('/api/describe/account');
     * ```
     */
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        const response = await this.httpClient.post('/auth/login', credentials);

        if (!response.success) {
            return response as AuthResponse;
        }

        // Automatically cache the token
        this.httpClient.setAuthToken(response.data.token);

        return response as AuthResponse;
    }

    /**
     * Register a new tenant
     *
     * Creates a new tenant from a template and automatically caches
     * the JWT token for the new tenant admin user.
     *
     * @param params - Registration parameters
     * @returns Promise with authentication response
     *
     * @example
     * ```typescript
     * const authClient = new AuthClient();
     * const response = await authClient.register({
     *     tenant: 'new-tenant',
     *     template: 'testing',
     *     username: 'admin'
     * });
     *
     * // Token is now cached - use httpClient for authenticated requests
     * const data = await authClient.httpClient.post('/api/data/account', {...});
     * ```
     */
    async register(params: RegistrationParams): Promise<AuthResponse> {
        const response = await this.httpClient.post('/auth/register', params);

        if (!response.success) {
            return response as AuthResponse;
        }

        // Automatically cache the token
        this.httpClient.setAuthToken(response.data.token);

        return response as AuthResponse;
    }

    /**
     * Get the current JWT token
     *
     * @returns Current JWT token or undefined
     */
    getToken(): string | undefined {
        return this.httpClient.getAuthToken();
    }

    /**
     * Set a JWT token manually
     *
     * Useful for testing with pre-existing tokens or switching users.
     *
     * @param token - JWT token to use
     */
    setToken(token: string): void {
        this.httpClient.setAuthToken(token);
    }

    /**
     * Clear the current JWT token
     */
    clearToken(): void {
        this.httpClient.clearAuthToken();
    }

    /**
     * Get the underlying HttpClient
     *
     * Use this to make authenticated API requests after login/register.
     *
     * @returns HttpClient instance with cached auth token
     *
     * @example
     * ```typescript
     * const authClient = new AuthClient();
     * await authClient.login({ tenant: 'test', username: 'admin' });
     *
     * // Access the HTTP client for API calls
     * const client = authClient.client;
     * const response = await client.get('/api/describe/account');
     * ```
     */
    get client(): HttpClient {
        return this.httpClient;
    }
}

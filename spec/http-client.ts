/**
 * HTTP Client Test Utilities
 *
 * Provides helpers for making HTTP requests with different Content-Type formats
 * Used for testing format middleware (YAML, TOON, Morse, etc.)
 */

export interface HttpRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    contentType?: string;
    accept?: string;
}

export interface HttpResponse {
    status: number;
    statusText: string;
    headers: Headers;
    body: string;
    json?: any;
}

/**
 * HTTP Client for testing API endpoints with different formats
 */
export class HttpClient {
    private baseUrl: string;
    private authToken?: string;

    constructor(baseUrl: string = 'http://localhost:9001', authToken?: string) {
        this.baseUrl = baseUrl;
        this.authToken = authToken;
    }

    /**
     * Set the authentication token for all subsequent requests
     * 
     * @param token - JWT token to use for authentication
     */
    setAuthToken(token: string): void {
        this.authToken = token;
    }

    /**
     * Get the current authentication token
     * 
     * @returns Current JWT token or undefined
     */
    getAuthToken(): string | undefined {
        return this.authToken;
    }

    /**
     * Clear the authentication token
     */
    clearAuthToken(): void {
        this.authToken = undefined;
    }

    /**
     * Make an HTTP request with custom options
     *
     * @param path - API path (e.g., "/auth/login")
     * @param options - Request options
     * @returns Promise with response details
     */
    async request(path: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
        const {
            method = 'GET',
            headers = {},
            body,
            contentType,
            accept,
        } = options;

        const url = `${this.baseUrl}${path}`;

        const fetchHeaders: Record<string, string> = { ...headers };

        // Automatically add cached auth token if available and not already provided
        if (this.authToken && !fetchHeaders['Authorization']) {
            fetchHeaders['Authorization'] = `Bearer ${this.authToken}`;
        }

        if (contentType) {
            fetchHeaders['Content-Type'] = contentType;
        }

        if (accept) {
            fetchHeaders['Accept'] = accept;
        }

        let requestBody: string | undefined;

        if (body) {
            if (typeof body === 'string') {
                requestBody = body;
            } else if (contentType === 'application/json' || !contentType) {
                requestBody = JSON.stringify(body);
                if (!fetchHeaders['Content-Type']) {
                    fetchHeaders['Content-Type'] = 'application/json';
                }
            } else {
                // For other content types, body should already be formatted as string
                requestBody = body;
            }
        }

        const response = await fetch(url, {
            method,
            headers: fetchHeaders,
            body: requestBody,
        });

        const responseBody = await response.text();

        // Try to parse JSON if response is JSON
        let jsonData: any;
        try {
            jsonData = JSON.parse(responseBody);
        } catch {
            // Not JSON, that's ok
        }

        return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: responseBody,
            json: jsonData,
        };
    }

    /**
     * Make a GET request
     *
     * @param path - API path
     * @param options - Request options
     * @returns Promise with parsed JSON response
     */
    async get(path: string, options: HttpRequestOptions = {}): Promise<any> {
        const response = await this.request(path, {
            ...options,
            method: 'GET',
        });
        return response.json;
    }

    /**
     * Make a POST request
     *
     * @param path - API path
     * @param body - Request body (will be JSON.stringified)
     * @param options - Request options
     * @returns Promise with parsed JSON response
     */
    async post(path: string, body?: any, options: HttpRequestOptions = {}): Promise<any> {
        const response = await this.request(path, {
            ...options,
            method: 'POST',
            body,
            contentType: options.contentType || 'application/json',
        });
        return response.json;
    }

    /**
     * Make a PUT request
     *
     * @param path - API path
     * @param body - Request body (will be JSON.stringified)
     * @param options - Request options
     * @returns Promise with parsed JSON response
     */
    async put(path: string, body?: any, options: HttpRequestOptions = {}): Promise<any> {
        const response = await this.request(path, {
            ...options,
            method: 'PUT',
            body,
            contentType: options.contentType || 'application/json',
        });
        return response.json;
    }

    /**
     * Make a DELETE request
     *
     * @param path - API path
     * @param options - Request options
     * @returns Promise with parsed JSON response
     */
    async delete(path: string, options: HttpRequestOptions = {}): Promise<any> {
        const response = await this.request(path, {
            ...options,
            method: 'DELETE',
        });
        return response.json;
    }

    /**
     * Make a POST request with YAML format
     *
     * @param path - API path
     * @param body - Request body (will be sent as-is, should be YAML formatted)
     * @returns Promise with response
     */
    async postYaml(path: string, body: string): Promise<HttpResponse> {
        return this.request(path, {
            method: 'POST',
            contentType: 'application/yaml',
            accept: 'application/yaml',
            body,
        });
    }

    /**
     * Make a POST request with TOON format
     *
     * @param path - API path
     * @param body - Request body (will be sent as-is, should be TOON formatted)
     * @returns Promise with response
     */
    async postToon(path: string, body: string): Promise<HttpResponse> {
        return this.request(path, {
            method: 'POST',
            contentType: 'application/toon',
            accept: 'application/toon',
            body,
        });
    }

    /**
     * Make a POST request with Morse format
     *
     * @param path - API path
     * @param body - Request body (will be sent as-is, should be Morse formatted)
     * @returns Promise with response
     */
    async postMorse(path: string, body: string): Promise<HttpResponse> {
        return this.request(path, {
            method: 'POST',
            contentType: 'application/morse',
            accept: 'application/morse',
            body,
        });
    }

    /**
     * Make a POST request with JSON format
     *
     * @param path - API path
     * @param body - Request body (will be JSON.stringified)
     * @returns Promise with response
     */
    async postJson(path: string, body: any): Promise<HttpResponse> {
        return this.request(path, {
            method: 'POST',
            contentType: 'application/json',
            accept: 'application/json',
            body,
        });
    }

    /**
     * Make an authenticated request with JWT token
     *
     * @param path - API path
     * @param token - JWT token
     * @param options - Request options
     * @returns Promise with response
     */
    async authenticatedRequest(
        path: string,
        token: string,
        options: HttpRequestOptions = {}
    ): Promise<HttpResponse> {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
        };

        return this.request(path, { ...options, headers });
    }
}

/**
 * Format validation helpers
 */
export class FormatValidator {
    /**
     * Check if response is in YAML format
     * Simple check: starts with "success:" or "error:"
     */
    static isYaml(body: string): boolean {
        return /^(success|error|token):/.test(body.trim());
    }

    /**
     * Check if response is in TOON format
     * TOON format is similar to YAML for simple cases
     */
    static isToon(body: string): boolean {
        return /^(success|error|token):/.test(body.trim());
    }

    /**
     * Check if response is in Morse format
     * Morse uses dots, dashes, and spaces
     */
    static isMorse(body: string): boolean {
        return /^[.\- ]+$/.test(body.trim());
    }

    /**
     * Check if response is in JSON format
     */
    static isJson(body: string): boolean {
        try {
            JSON.parse(body);
            return true;
        } catch {
            return false;
        }
    }
}

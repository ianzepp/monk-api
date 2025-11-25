/**
 * Test Assertion Helpers
 *
 * Custom assertions that provide better error visibility for API responses.
 * These helpers display the actual error message when assertions fail,
 * rather than just showing "expected false to be true".
 */

import { expect } from 'vitest';

/**
 * API Response Structure
 */
export interface ApiResponse<T = any> {
    success: boolean;
    error?: string;
    data?: T;
}

/**
 * Assert that an API response was successful
 *
 * This helper checks response.success and displays the actual error message
 * when the assertion fails, making debugging much easier.
 *
 * @param response - The API response object
 * @param message - Optional custom message to prepend to the error
 *
 * @example
 * ```typescript
 * const response = await httpClient.post('/api/describe/products', { ... });
 * expectSuccess(response);
 * expect(response.data.model_name).toBe('products');
 * ```
 *
 * @example
 * ```typescript
 * // With custom context message
 * const response = await httpClient.post('/api/describe/products/name', { type: 'text' });
 * expectSuccess(response, 'Failed to create field');
 * ```
 */
export function expectSuccess(response: ApiResponse, message?: string): void {
    if (!response.success) {
        const errorMessage = message
            ? `${message}: ${response.error || 'Unknown error'}`
            : response.error || 'Unknown error';

        throw new Error(`Expected success but got error: ${errorMessage}`);
    }

    expect(response.success).toBe(true);
}

/**
 * Assert that an API response failed
 *
 * This helper checks that response.success is false and optionally
 * validates the error message content.
 *
 * @param response - The API response object
 * @param errorPattern - Optional regex pattern or string to match against the error
 *
 * @example
 * ```typescript
 * const response = await httpClient.post('/api/describe/products/duplicate', { type: 'text' });
 * expectError(response);
 * ```
 *
 * @example
 * ```typescript
 * // With error pattern matching
 * const response = await httpClient.post('/api/describe/nonexistent/field', { type: 'text' });
 * expectError(response, /model.*not found/i);
 * ```
 */
export function expectError(response: ApiResponse, errorPattern?: RegExp | string): void {
    expect(response.success).toBe(false);

    if (errorPattern) {
        const error = response.error || '';
        if (typeof errorPattern === 'string') {
            expect(error).toContain(errorPattern);
        } else {
            expect(error).toMatch(errorPattern);
        }
    }
}

/**
 * Assert that response has data and return it with type safety
 *
 * This helper combines success check with data validation, providing
 * type-safe access to the response data.
 *
 * @param response - The API response object
 * @returns The response data with type T
 *
 * @example
 * ```typescript
 * const response = await httpClient.post('/api/describe/products', { ... });
 * const model = expectData<ModelRecord>(response);
 * expect(model.model_name).toBe('products');
 * ```
 */
export function expectData<T>(response: ApiResponse<T>): T {
    expectSuccess(response);

    if (response.data === undefined || response.data === null) {
        throw new Error('Expected response.data to be defined but got: ' + response.data);
    }

    return response.data;
}

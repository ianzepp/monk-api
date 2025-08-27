/**
 * Observer Testing Helpers
 *
 * Utilities for testing the observer framework
 */
import { vi, expect } from 'vitest';
/**
 * Create a mock System for testing
 */
export function createMockSystem() {
    return {
        db: {
            query: vi.fn().mockImplementation(async (query, params) => {
                // Mock schema table queries for schema loading
                if (query.includes('FROM schema')) {
                    return {
                        rows: [{
                                name: params?.[0] || 'mock-schema',
                                table_name: params?.[0] || 'mock-schema',
                                status: 'active',
                                definition: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        email: { type: 'string', format: 'email' }
                                    },
                                    required: ['name', 'email']
                                },
                                yaml_checksum: 'mock-checksum'
                            }]
                    };
                }
                return { rows: [] };
            }),
            connect: vi.fn().mockResolvedValue({
                query: vi.fn().mockResolvedValue({ rows: [] }),
                release: vi.fn()
            })
        },
        tx: undefined,
        database: {
            createOne: vi.fn(),
            updateOne: vi.fn(),
            deleteOne: vi.fn(),
            selectOne: vi.fn(),
            selectAll: vi.fn()
        },
        getUserId: vi.fn(() => 'test-user-id'),
        info: vi.fn(),
        warn: vi.fn()
    };
}
/**
 * Create a mock ObserverContext for testing
 */
export function createMockContext(schema, operation, data, recordId, existing) {
    return {
        system: createMockSystem(),
        operation,
        schema,
        data,
        recordId,
        existing,
        result: undefined,
        metadata: new Map(),
        errors: [],
        warnings: [],
        startTime: Date.now(),
        currentRing: undefined,
        currentObserver: undefined
    };
}
/**
 * Create a mock observer for testing
 */
export function createMockObserver(ring, operations, name, shouldThrow = false, executionDelay = 0) {
    const observer = {
        ring,
        operations,
        name,
        execute: vi.fn(async (context) => {
            if (executionDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, executionDelay));
            }
            if (shouldThrow) {
                throw new Error(`Mock observer error: ${name || 'unnamed'}`);
            }
            // Add a test marker to metadata
            context.metadata.set(`${name || 'mock'}_executed`, true);
        })
    };
    return observer;
}
/**
 * Create a validation observer that adds errors
 */
export function createValidationObserver(ring, shouldAddError = true, shouldAddWarning = false, name = 'TestValidator') {
    return {
        ring,
        name,
        execute: vi.fn(async (context) => {
            if (shouldAddError) {
                context.errors.push({
                    message: 'Test validation error',
                    field: 'test_field',
                    code: 'TEST_ERROR',
                    ring,
                    observer: name
                });
            }
            if (shouldAddWarning) {
                context.warnings.push({
                    message: 'Test validation warning',
                    field: 'test_field',
                    code: 'TEST_WARNING',
                    ring,
                    observer: name
                });
            }
        })
    };
}
/**
 * Assert that an observer was executed
 */
export function assertObserverExecuted(context, observerName) {
    expect(context.metadata.get(`${observerName}_executed`)).toBe(true);
}
/**
 * Assert that specific error was added
 */
export function assertErrorAdded(context, code, observer) {
    const matchingError = context.errors.find(error => error.code === code && (!observer || error.observer === observer));
    expect(matchingError).toBeDefined();
}
/**
 * Assert that specific warning was added
 */
export function assertWarningAdded(context, code, observer) {
    const matchingWarning = context.warnings.find(warning => warning.code === code && (!observer || warning.observer === observer));
    expect(matchingWarning).toBeDefined();
}
//# sourceMappingURL=observer-helpers.js.map
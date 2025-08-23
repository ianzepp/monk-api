/**
 * Observer Testing Helpers
 * 
 * Utilities for testing the observer framework
 */

import { vi, expect } from 'vitest';
import type { System } from '../../src/lib/system.js';
import type { ObserverContext, Observer } from '../../src/lib/observers/interfaces.js';
import type { OperationType, ObserverRing } from '../../src/lib/observers/types.js';

/**
 * Create a mock System for testing
 */
export function createMockSystem(): System {
    return {
        database: {
            createOne: vi.fn(),
            updateOne: vi.fn(),
            deleteOne: vi.fn(),
            selectOne: vi.fn(),
            selectAll: vi.fn()
        },
        getUserId: vi.fn(() => 'test-user-id')
    } as any;
}

/**
 * Create a mock ObserverContext for testing
 */
export function createMockContext(
    schema: string,
    operation: OperationType,
    data?: any,
    recordId?: string,
    existing?: any
): ObserverContext {
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
export function createMockObserver(
    ring: ObserverRing,
    operations?: OperationType[],
    name?: string,
    shouldThrow = false,
    executionDelay = 0
): Observer {
    const observer = {
        ring,
        operations,
        name,
        execute: vi.fn(async (context: ObserverContext): Promise<void> => {
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
export function createValidationObserver(
    ring: ObserverRing,
    shouldAddError = true,
    shouldAddWarning = false,
    name = 'TestValidator'
): Observer {
    return {
        ring,
        name,
        execute: vi.fn(async (context: ObserverContext): Promise<void> => {
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
export function assertObserverExecuted(context: ObserverContext, observerName: string): void {
    expect(context.metadata.get(`${observerName}_executed`)).toBe(true);
}

/**
 * Assert that specific error was added
 */
export function assertErrorAdded(context: ObserverContext, code: string, observer?: string): void {
    const matchingError = context.errors.find(error => 
        error.code === code && (!observer || error.observer === observer)
    );
    expect(matchingError).toBeDefined();
}

/**
 * Assert that specific warning was added
 */
export function assertWarningAdded(context: ObserverContext, code: string, observer?: string): void {
    const matchingWarning = context.warnings.find(warning => 
        warning.code === code && (!observer || warning.observer === observer)
    );
    expect(matchingWarning).toBeDefined();
}
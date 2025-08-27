/**
 * Observer Testing Helpers
 *
 * Utilities for testing the observer framework
 */
import type { System } from '@src/lib/system.js';
import type { ObserverContext, Observer } from '@src/lib/observers/interfaces.js';
import type { OperationType, ObserverRing } from '@src/lib/observers/types.js';
/**
 * Create a mock System for testing
 */
export declare function createMockSystem(): System;
/**
 * Create a mock ObserverContext for testing
 */
export declare function createMockContext(schema: string, operation: OperationType, data?: any, recordId?: string, existing?: any): ObserverContext;
/**
 * Create a mock observer for testing
 */
export declare function createMockObserver(ring: ObserverRing, operations?: OperationType[], name?: string, shouldThrow?: boolean, executionDelay?: number): Observer;
/**
 * Create a validation observer that adds errors
 */
export declare function createValidationObserver(ring: ObserverRing, shouldAddError?: boolean, shouldAddWarning?: boolean, name?: string): Observer;
/**
 * Assert that an observer was executed
 */
export declare function assertObserverExecuted(context: ObserverContext, observerName: string): void;
/**
 * Assert that specific error was added
 */
export declare function assertErrorAdded(context: ObserverContext, code: string, observer?: string): void;
/**
 * Assert that specific warning was added
 */
export declare function assertWarningAdded(context: ObserverContext, code: string, observer?: string): void;
//# sourceMappingURL=observer-helpers.d.ts.map
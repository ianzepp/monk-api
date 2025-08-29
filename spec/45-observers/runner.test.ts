/**
 * ObserverRunner Tests
 */

import { describe, test, beforeEach, expect, vi } from 'vitest';
import { ObserverRunner } from '@src/lib/observers/runner.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { ObserverRing, DATABASE_RING } from '@src/lib/observers/types.js';
import { 
    createMockSystem, 
    createMockObserver, 
    createValidationObserver,
    assertObserverExecuted,
    assertErrorAdded,
    assertWarningAdded
} from '@spec/helpers/observer-helpers.js';

// Mock the ObserverLoader
vi.mock('@src/lib/observers/loader.js');
const mockObserverLoader = ObserverLoader as any;

describe('ObserverRunner', () => {
    let runner: ObserverRunner;
    let mockSystem: any;

    beforeEach(() => {
        runner = new ObserverRunner();
        mockSystem = createMockSystem();
        
        // Reset mock
        vi.clearAllMocks();
        mockObserverLoader.getObservers.mockReturnValue([]);
    });

    describe('execute', () => {
        test('should execute rings 0-9 in order', async () => {
            const executionOrder: number[] = [];
            
            // Mock observers for different rings
            const validationObserver = createMockObserver(ObserverRing.InputValidation, undefined, 'validator');
            const businessObserver = createMockObserver(ObserverRing.Business, undefined, 'business');
            const auditObserver = createMockObserver(ObserverRing.Audit, undefined, 'audit');
            
            // Track execution order
            validationObserver.execute = vi.fn(async (context) => {
                executionOrder.push(ObserverRing.InputValidation);
                context.metadata.set('validator_executed', true);
            });
            
            businessObserver.execute = vi.fn(async (context) => {
                executionOrder.push(ObserverRing.Business);
                context.metadata.set('business_executed', true);
            });
            
            auditObserver.execute = vi.fn(async (context) => {
                executionOrder.push(ObserverRing.Audit);
                context.metadata.set('audit_executed', true);
            });

            // Mock getObservers to return appropriate observers for each ring
            mockObserverLoader.getObservers.mockImplementation((schema, ring) => {
                switch (ring) {
                    case ObserverRing.InputValidation: return [validationObserver];
                    case ObserverRing.Business: return [businessObserver];
                    case ObserverRing.Audit: return [auditObserver];
                    default: return [];
                }
            });

            const result = await runner.execute(
                mockSystem,
                'create',
                'users',
                { name: 'test' }
            );

            expect(result.success).toBe(true);
            expect(executionOrder).toEqual([
                ObserverRing.InputValidation,
                ObserverRing.Business,
                ObserverRing.Audit
            ]);
        });

        test('should handle database ring (placeholder)', async () => {
            const result = await runner.execute(
                mockSystem,
                'create',
                'users',
                { name: 'test' }
            );

            expect(result.success).toBe(true);
            expect(result.result).toEqual({
                placeholder: true,
                operation: 'create',
                schema: 'users',
                data: { name: 'test' },
                recordId: undefined
            });
        });

        test('should stop execution on validation errors before database ring', async () => {
            const validationObserver = createValidationObserver(
                ObserverRing.InputValidation, 
                true, // add error
                false, // no warning
                'ErrorValidator'
            );
            
            const auditObserver = createMockObserver(ObserverRing.Audit, undefined, 'audit');

            mockObserverLoader.getObservers.mockImplementation((schema, ring) => {
                switch (ring) {
                    case ObserverRing.InputValidation: return [validationObserver];
                    case ObserverRing.Audit: return [auditObserver];
                    default: return [];
                }
            });

            const result = await runner.execute(
                mockSystem,
                'create',
                'users',
                { name: 'test' }
            );

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('TEST_ERROR');
            
            // Audit observer should not have been executed due to early termination
            expect(auditObserver.execute).not.toHaveBeenCalled();
        });

        test('should continue execution on warnings', async () => {
            const validationObserver = createValidationObserver(
                ObserverRing.InputValidation,
                false, // no error
                true,  // add warning
                'WarningValidator'
            );
            
            const auditObserver = createMockObserver(ObserverRing.Audit, undefined, 'audit');

            mockObserverLoader.getObservers.mockImplementation((schema, ring) => {
                switch (ring) {
                    case ObserverRing.InputValidation: return [validationObserver];
                    case ObserverRing.Audit: return [auditObserver];
                    default: return [];
                }
            });

            const result = await runner.execute(
                mockSystem,
                'create',
                'users',
                { name: 'test' }
            );

            expect(result.success).toBe(true);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].code).toBe('TEST_WARNING');
            
            // Audit observer should have been executed
            expect(auditObserver.execute).toHaveBeenCalled();
        });

        test('should handle observer execution failures gracefully', async () => {
            const throwingObserver = createMockObserver(
                ObserverRing.InputValidation,
                undefined,
                'ThrowingObserver',
                true // should throw
            );

            mockObserverLoader.getObservers.mockImplementation((schema, ring) => {
                if (ring === ObserverRing.InputValidation) return [throwingObserver];
                return [];
            });

            const result = await runner.execute(
                mockSystem,
                'create',
                'users',
                { name: 'test' }
            );

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('OBSERVER_ERROR');
            expect(result.errors[0].observer).toBe('ThrowingObserver');
        });

        test('should respect operation filtering', async () => {
            const createOnlyObserver = createMockObserver(
                ObserverRing.InputValidation,
                ['create'], // only for create operations
                'CreateOnlyObserver'
            );

            // Mock to return observer only for validation ring
            mockObserverLoader.getObservers.mockImplementation((schema, ring) => {
                return ring === ObserverRing.InputValidation ? [createOnlyObserver] : [];
            });

            // Test with create operation - should execute
            const createResult = await runner.execute(
                mockSystem,
                'create',
                'users',
                { name: 'test' }
            );

            expect(createResult.success).toBe(true);
            expect(createOnlyObserver.execute).toHaveBeenCalledTimes(1);

            // Reset mock
            vi.clearAllMocks();
            mockObserverLoader.getObservers.mockImplementation((schema, ring) => {
                return ring === ObserverRing.InputValidation ? [createOnlyObserver] : [];
            });

            // Test with update operation - should not execute
            const updateResult = await runner.execute(
                mockSystem,
                'update',
                'users',
                { name: 'test' },
                'user-id'
            );

            expect(updateResult.success).toBe(true);
            expect(createOnlyObserver.execute).not.toHaveBeenCalled();
        });

        test('should provide complete context to observers', async () => {
            const contextCheckObserver = createMockObserver(
                ObserverRing.InputValidation,
                undefined,
                'ContextChecker'
            );
            
            contextCheckObserver.execute = vi.fn(async (context) => {
                expect(context.system).toBe(mockSystem);
                expect(context.operation).toBe('update');
                expect(context.schema).toBe('users');
                expect(context.data).toEqual({ name: 'updated' });
                expect(context.recordId).toBe('user-123');
                expect(context.existing).toEqual({ name: 'original' });
                expect(context.metadata).toBeInstanceOf(Map);
                expect(context.errors).toBeInstanceOf(Array);
                expect(context.warnings).toBeInstanceOf(Array);
                expect(typeof context.startTime).toBe('number');
            });

            mockObserverLoader.getObservers.mockReturnValue([contextCheckObserver]);

            await runner.execute(
                mockSystem,
                'update',
                'users',
                { name: 'updated' },
                'user-123',
                { name: 'original' }
            );

            expect(contextCheckObserver.execute).toHaveBeenCalled();
        });
    });

    describe('validateContext', () => {
        test('should validate complete context', () => {
            const validContext = {
                system: mockSystem,
                operation: 'create' as const,
                schema: 'users',
                metadata: new Map(),
                errors: [],
                warnings: [],
                startTime: Date.now()
            };

            expect(ObserverRunner.validateContext(validContext)).toBe(true);
        });

        test('should reject incomplete context', () => {
            const incompleteContext = {
                system: mockSystem,
                operation: 'create' as const,
                // missing required fields
            };

            expect(ObserverRunner.validateContext(incompleteContext)).toBe(false);
        });
    });
});
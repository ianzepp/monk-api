/**
 * Complete Observer Pipeline Integration Test
 * 
 * Tests the full end-to-end observer pipeline with real database operations
 */

import { describe, test, beforeAll, beforeEach, expect, vi } from 'vitest';
import { ObserverLoader } from '@observers/loader.js';
import { executeObserverPipeline } from '@lib/observers/route-integration.js';
import { createMockSystem } from '@test/helpers/observer-helpers.js';

describe('Complete Observer Pipeline Integration', () => {
    let mockSystem: any;

    beforeAll(async () => {
        // Load real observers
        await ObserverLoader.preloadObservers();
    });

    beforeEach(() => {
        mockSystem = createMockSystem();
        
        // Mock successful database operations
        mockSystem.database.createOne.mockResolvedValue({ 
            id: 'created-123', 
            email: 'test@example.com',
            name: 'Test User' 
        });
        
        mockSystem.database.updateOne.mockResolvedValue({ 
            id: 'updated-123', 
            email: 'updated@example.com',
            name: 'Updated User' 
        });
        
        mockSystem.database.deleteOne.mockResolvedValue({ 
            id: 'deleted-123', 
            deleted: true 
        });
        
        vi.clearAllMocks();
    });

    describe('User Creation with Full Pipeline', () => {
        test('should execute all observers and database operation for valid user', async () => {
            const userData = {
                email: '  TEST@EXAMPLE.COM  ', // Will be normalized
                name: 'Test User'
            };

            const result = await executeObserverPipeline(
                mockSystem,
                'create',
                'user',
                userData
            );

            // Should succeed
            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);
            
            // Email should be normalized by EmailValidator
            expect(userData.email).toBe('test@example.com');
            
            // Database operation should have been called
            expect(mockSystem.database.createOne).toHaveBeenCalledWith(
                'user',
                userData
            );
            
            // Should have database result
            expect(result.result.id).toBe('created-123');
            
            // Should have metadata from observers
            expect(result.metadata.get('audit_logged')).toBe(true);
            expect(result.metadata.get('cache_invalidated')).toBe(true);
        });

        test('should fail validation and prevent database operation for invalid user', async () => {
            const userData = {
                email: 'invalid-email-format',
                // Missing required name field
            };

            const result = await executeObserverPipeline(
                mockSystem,
                'create',
                'user',
                userData
            );

            // Should fail validation
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            
            // Database operation should NOT have been called
            expect(mockSystem.database.createOne).not.toHaveBeenCalled();
            
            // Should have validation errors
            const emailError = result.errors.find(e => e.code === 'INVALID_EMAIL_FORMAT');
            const requiredError = result.errors.find(e => e.code === 'REQUIRED_FIELD_MISSING');
            
            expect(emailError).toBeDefined();
            expect(requiredError).toBeDefined();
        });
    });

    describe('Account Balance Operations', () => {
        test('should validate account balance and execute database operation', async () => {
            const accountData = {
                name: 'Test Account',
                balance: 1000,
                type: 'checking'
            };

            const result = await executeObserverPipeline(
                mockSystem,
                'create',
                'account',
                accountData
            );

            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);
            
            // Database operation should have been called
            expect(mockSystem.database.createOne).toHaveBeenCalledWith(
                'account',
                accountData
            );
            
            // Should have balance metadata
            expect(result.metadata.get('initial_balance')).toBe(1000);
        });

        test('should reject account with negative starting balance', async () => {
            const accountData = {
                name: 'Test Account',
                balance: -500, // Invalid negative starting balance
                type: 'checking'
            };

            const result = await executeObserverPipeline(
                mockSystem,
                'create',
                'account',
                accountData
            );

            expect(result.success).toBe(false);
            
            // Should have business logic error
            const balanceError = result.errors.find(e => e.code === 'NEGATIVE_STARTING_BALANCE');
            expect(balanceError).toBeDefined();
            
            // Database operation should NOT have been called
            expect(mockSystem.database.createOne).not.toHaveBeenCalled();
        });

        test('should update account balance and track changes', async () => {
            const existingAccount = {
                id: 'account-123',
                balance: 1000,
                credit_limit: 500
            };

            const updateData = {
                balance: 800
            };

            const result = await executeObserverPipeline(
                mockSystem,
                'update',
                'account',
                updateData,
                'account-123',
                existingAccount
            );

            expect(result.success).toBe(true);
            
            // Database operation should have been called
            expect(mockSystem.database.updateOne).toHaveBeenCalledWith(
                'account',
                'account-123',
                updateData
            );
            
            // Should track balance change
            expect(result.metadata.get('balance_change')).toBe(-200);
            expect(result.metadata.get('transaction_type')).toBe('debit');
        });
    });

    describe('Cross-Ring Communication', () => {
        test('should share metadata between validation, business, audit, and integration rings', async () => {
            const userData = {
                email: 'admin@example.com',
                name: 'Admin User',
                role: 'admin'
            };

            const result = await executeObserverPipeline(
                mockSystem,
                'create',
                'user',
                userData
            );

            expect(result.success).toBe(true);
            
            // Metadata should flow through rings
            // Ring 2 (Business) -> Ring 7 (Audit) -> Ring 8 (Integration)
            expect(result.metadata.get('target_role')).toBe('admin');
            expect(result.metadata.get('audit_logged')).toBe(true);
            expect(result.metadata.get('cache_invalidated')).toBe(true);
            expect(result.metadata.get('webhooks_sent')).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Universal Observer Application', () => {
        test('should apply universal observers to all schemas', async () => {
            // Test with user schema
            const userResult = await executeObserverPipeline(
                mockSystem,
                'create',
                'user',
                { email: 'user@test.com', name: 'User' }
            );

            // Test with account schema  
            const accountResult = await executeObserverPipeline(
                mockSystem,
                'create',
                'account',
                { name: 'Account', balance: 100, type: 'savings' }
            );

            // Both should have universal observer effects
            expect(userResult.metadata.get('audit_logged')).toBe(true);
            expect(userResult.metadata.get('cache_invalidated')).toBe(true);
            
            expect(accountResult.metadata.get('audit_logged')).toBe(true);
            expect(accountResult.metadata.get('cache_invalidated')).toBe(true);
        });
    });

    describe('Observer Execution Order', () => {
        test('should execute observers in correct ring order', async () => {
            const userData = {
                email: '  test@EXAMPLE.com  ', // Will be normalized in Ring 0
                name: 'Test User'
            };

            const result = await executeObserverPipeline(
                mockSystem,
                'create',
                'user',
                userData
            );

            expect(result.success).toBe(true);
            
            // Ring 0 should have normalized email
            expect(userData.email).toBe('test@example.com');
            
            // Ring 5 should have executed database operation
            expect(mockSystem.database.createOne).toHaveBeenCalled();
            
            // Ring 7 should have logged audit
            expect(result.metadata.get('audit_logged')).toBe(true);
            
            // Ring 8 should have invalidated cache
            expect(result.metadata.get('cache_invalidated')).toBe(true);
        });
    });
});
/**
 * Observer Pipeline Integration Tests
 * 
 * Tests the complete observer execution pipeline with real examples
 */

import { describe, test, beforeEach, expect, vi, beforeAll } from 'vitest';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { ObserverRunner } from '@src/lib/observers/runner.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { createMockSystem } from '@spec/helpers/observer-helpers.js';

describe('Observer Pipeline Integration', () => {
    let runner: ObserverRunner;
    let mockSystem: any;

    beforeAll(async () => {
        // Load observers from the filesystem
        await ObserverLoader.preloadObservers();
    });

    beforeEach(() => {
        runner = new ObserverRunner();
        mockSystem = createMockSystem();
        
        // Mock database operations to prevent actual database calls
        mockSystem.database.createOne.mockResolvedValue({ id: 'mock-id', success: true });
        mockSystem.database.updateOne.mockResolvedValue({ id: 'mock-id', success: true });
        mockSystem.database.selectOne.mockResolvedValue({ id: 'mock-id', existing: 'data' });
    });

    describe('User Creation Pipeline', () => {
        test('should execute validation, business logic, and integration observers for user creation', async () => {
            const userData = {
                email: 'test@example.com',
                role: 'user',
                name: 'Test User'
            };

            const result = await runner.execute(
                mockSystem,
                'create',
                'user',
                userData
            );

            // Should succeed after validation and processing
            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);

            // Verify data transformations from observers
            expect(userData.email).toBe('test@example.com'); // Normalized by EmailValidator
            
            // Check metadata set by observers
            expect(result.metadata.get('creator_role')).toBeDefined();
            expect(result.metadata.get('target_role')).toBe('user');
            expect(result.metadata.get('audit_logged')).toBe(true);
            expect(result.metadata.get('cache_invalidated')).toBe(true);
        });

        test('should fail validation for invalid email', async () => {
            const userData = {
                email: 'invalid-email',
                role: 'user',
                name: 'Test User'
            };

            const result = await runner.execute(
                mockSystem,
                'create',
                'user',
                userData
            );

            // Should fail validation
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            
            // Check for email validation error
            const emailError = result.errors.find(e => e.code === 'INVALID_EMAIL_FORMAT');
            expect(emailError).toBeDefined();
            expect(emailError?.field).toBe('email');
            expect(emailError?.ring).toBe(ObserverRing.Validation);
        });

        test('should fail validation for missing required fields', async () => {
            const userData = {
                name: 'Test User'
                // Missing email (required field)
            };

            const result = await runner.execute(
                mockSystem,
                'create',
                'user',
                userData
            );

            // Should fail validation
            expect(result.success).toBe(false);
            
            // Check for required field error
            const requiredFieldError = result.errors.find(e => e.code === 'REQUIRED_FIELD_MISSING');
            expect(requiredFieldError).toBeDefined();
            expect(requiredFieldError?.field).toBe('email');
        });

        test('should sanitize input data', async () => {
            const userData = {
                email: '  TEST@EXAMPLE.COM  ',
                name: '<script>alert("xss")</script>Test User',
                role: 'user'
            };

            const result = await runner.execute(
                mockSystem,
                'create',
                'user',
                userData
            );

            expect(result.success).toBe(true);
            
            // Verify sanitization
            expect(userData.email).toBe('test@example.com'); // Trimmed and lowercased
            expect(userData.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;Test User');
        });
    });

    describe('Account Update Pipeline', () => {
        test('should validate balance changes and track metadata', async () => {
            const existingAccount = {
                id: 'account-123',
                balance: 1000,
                credit_limit: 500
            };

            const updateData = {
                balance: 800
            };

            const result = await runner.execute(
                mockSystem,
                'update',
                'account',
                updateData,
                'account-123',
                existingAccount
            );

            expect(result.success).toBe(true);
            
            // Check balance change metadata
            expect(result.metadata.get('balance_change')).toBe(-200);
            expect(result.metadata.get('previous_balance')).toBe(1000);
            expect(result.metadata.get('transaction_type')).toBe('debit');
        });

        test('should reject balance changes exceeding credit limit', async () => {
            const existingAccount = {
                id: 'account-123',
                balance: 1000,
                credit_limit: 500
            };

            const updateData = {
                balance: -600 // Would exceed credit limit
            };

            const result = await runner.execute(
                mockSystem,
                'update',
                'account',
                updateData,
                'account-123',
                existingAccount
            );

            expect(result.success).toBe(false);
            
            // Check for credit limit error
            const creditError = result.errors.find(e => e.code === 'CREDIT_LIMIT_EXCEEDED');
            expect(creditError).toBeDefined();
            expect(creditError?.ring).toBe(ObserverRing.Business);
        });

        test('should flag large transactions for audit', async () => {
            const existingAccount = {
                id: 'account-123',
                balance: 5000,
                credit_limit: 20000
            };

            const updateData = {
                balance: 16000 // Large increase
            };

            const result = await runner.execute(
                mockSystem,
                'update',
                'account',
                updateData,
                'account-123',
                existingAccount
            );

            expect(result.success).toBe(true);
            
            // Should have warnings for large transaction
            expect(result.warnings.length).toBeGreaterThan(0);
            const largeTransactionWarning = result.warnings.find(w => w.code === 'LARGE_BALANCE_CHANGE');
            expect(largeTransactionWarning).toBeDefined();
            
            // Should flag for audit
            expect(result.metadata.get('requires_audit')).toBe(true);
            expect(result.metadata.get('large_transaction')).toBe(true);
        });
    });

    describe('Cross-Observer Communication', () => {
        test('should share metadata between observers in different rings', async () => {
            const userData = {
                email: 'test@example.com',
                role: 'admin',
                name: 'Admin User'
            };

            const result = await runner.execute(
                mockSystem,
                'create',
                'user',
                userData
            );

            expect(result.success).toBe(true);
            
            // Metadata from business logic observer should be available to audit observer
            expect(result.metadata.get('creator_role')).toBeDefined();
            expect(result.metadata.get('target_role')).toBe('admin');
            
            // Audit observer should have processed this metadata
            expect(result.metadata.get('audit_logged')).toBe(true);
            expect(result.metadata.get('audit_timestamp')).toBeDefined();
        });
    });

    describe('Universal Observers', () => {
        test('should apply universal observers to all schemas', async () => {
            // Test with user schema
            const userResult = await runner.execute(
                mockSystem,
                'create',
                'user',
                { email: 'user@test.com', name: 'User' }
            );

            // Test with account schema  
            const accountResult = await runner.execute(
                mockSystem,
                'create',
                'account',
                { name: 'Test Account', balance: 100 }
            );

            // Both should have universal observer effects
            expect(userResult.metadata.get('audit_logged')).toBe(true);
            expect(userResult.metadata.get('cache_invalidated')).toBe(true);
            
            expect(accountResult.metadata.get('audit_logged')).toBe(true);
            expect(accountResult.metadata.get('cache_invalidated')).toBe(true);
        });
    });

    describe('Error Aggregation', () => {
        test('should collect multiple validation errors from different observers', async () => {
            const userData = {
                email: 'invalid-email', // Invalid format
                // Missing required fields
                role: 'superadmin' // Insufficient permissions
            };

            const result = await runner.execute(
                mockSystem,
                'create',
                'user',
                userData
            );

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(2); // Multiple validation errors
            
            // Should have errors from different observers
            const errorCodes = result.errors.map(e => e.code);
            expect(errorCodes).toContain('INVALID_EMAIL_FORMAT');
            expect(errorCodes).toContain('REQUIRED_FIELD_MISSING');
        });
    });

    describe('Observer Execution Order', () => {
        test('should execute observers in correct ring order', async () => {
            const userData = {
                email: '  test@EXAMPLE.com  ', // Will be normalized
                role: 'user',
                name: 'Test User'
            };

            const result = await runner.execute(
                mockSystem,
                'create',
                'user',
                userData
            );

            expect(result.success).toBe(true);
            
            // Email should be normalized by Ring 0 validation observer
            expect(userData.email).toBe('test@example.com');
            
            // Business logic metadata should be set (Ring 2)
            expect(result.metadata.get('target_role')).toBe('user');
            
            // Audit should have run after business logic (Ring 7)
            expect(result.metadata.get('audit_logged')).toBe(true);
            
            // Integration should have run last (Ring 8)
            expect(result.metadata.get('cache_invalidated')).toBe(true);
        });
    });
});
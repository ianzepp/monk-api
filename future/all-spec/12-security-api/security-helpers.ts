/**
 * Security Testing Helper Functions
 * 
 * Utilities for testing SQL injection protection and security validation
 * across API endpoints and database operations.
 */

import { expect } from 'vitest';
import type { TestContext } from '@spec/helpers/test-tenant.js';
import type { InjectionVector } from './injection-vectors.js';

export interface SecurityTestResult {
    success: boolean;
    vector: InjectionVector;
    response?: any;
    error?: any;
    executionTime: number;
    safelyStored: boolean;
    causedSqlError: boolean;
    revealedDatabaseInfo: boolean;
}

/**
 * Security-specific assertion helpers
 */
export class SecurityAssertions {
    /**
     * Assert that response doesn't contain SQL error indicators
     */
    static expectNoSqlErrors(response: any, error?: any): void {
        if (error) {
            const errorMessage = error.message?.toLowerCase() || '';
            expect(errorMessage).not.toContain('syntax error');
            expect(errorMessage).not.toContain('sql syntax');
            expect(errorMessage).not.toContain('column does not exist');
            expect(errorMessage).not.toContain('relation does not exist');
            expect(errorMessage).not.toContain('function does not exist');
            expect(errorMessage).not.toContain('unterminated quoted string');
        }
    }

    /**
     * Assert that response doesn't reveal database structure
     */
    static expectNoDatabaseDisclosure(response: any, error?: any): void {
        const textToCheck = JSON.stringify(response) + (error?.message || '');
        const lowerText = textToCheck.toLowerCase();
        
        // Database system disclosure
        expect(lowerText).not.toContain('postgresql');
        expect(lowerText).not.toContain('postgres');
        expect(lowerText).not.toContain('pg_');
        
        // Table/column disclosure
        expect(lowerText).not.toContain('information_schema');
        expect(lowerText).not.toContain('pg_catalog');
        expect(lowerText).not.toContain('pg_class');
        
        // Database configuration disclosure
        expect(lowerText).not.toContain('show databases');
        expect(lowerText).not.toContain('show tables');
        expect(lowerText).not.toContain('describe table');
    }

    /**
     * Assert that injection attempt was safely stored as data
     */
    static expectSafeStorage(storedValue: any, injectionPayload: string): void {
        expect(storedValue).toBe(injectionPayload);
    }

    /**
     * Assert that no privilege escalation occurred
     */
    static expectNoPrivilegeEscalation(response: any): void {
        // Check that response doesn't indicate admin access
        const responseText = JSON.stringify(response).toLowerCase();
        expect(responseText).not.toContain('admin');
        expect(responseText).not.toContain('grant');
        expect(responseText).not.toContain('privilege');
        expect(responseText).not.toContain('root');
        expect(responseText).not.toContain('superuser');
    }

    /**
     * Assert that operation completed within reasonable time (no time-based attacks)
     */
    static expectNoTimingAttack(executionTime: number, maxAllowedMs: number = 1000): void {
        expect(executionTime).toBeLessThan(maxAllowedMs);
    }

    /**
     * Comprehensive security validation for injection test result
     */
    static validateSecurityCompliance(result: SecurityTestResult): void {
        // Core security requirements
        this.expectNoSqlErrors(result.response, result.error);
        this.expectNoDatabaseDisclosure(result.response, result.error);
        this.expectNoPrivilegeEscalation(result.response);
        this.expectNoTimingAttack(result.executionTime);

        // Vector-specific validation
        if (result.vector.expectedBehavior === 'safe_storage') {
            expect(result.safelyStored).toBe(true);
        }
    }
}

/**
 * Injection testing framework for API endpoints
 */
export class InjectionTester {
    /**
     * Test a single injection vector against a database operation
     */
    static async testDatabaseOperation(
        testContext: TestContext,
        operation: 'create' | 'update' | 'delete',
        schema: string,
        vector: InjectionVector,
        additionalData?: any
    ): Promise<SecurityTestResult> {
        const startTime = Date.now();
        let response: any;
        let error: any;
        let safelyStored = false;
        let causedSqlError = false;
        let revealedDatabaseInfo = false;

        try {
            switch (operation) {
                case 'create':
                    response = await testContext.database.createOne(schema, {
                        name: vector.payload,
                        ...additionalData
                    });
                    // Check if injection payload was safely stored
                    safelyStored = response?.name === vector.payload;
                    break;

                case 'update':
                    if (!additionalData?.recordId) {
                        throw new Error('Update test requires recordId in additionalData');
                    }
                    response = await testContext.database.updateOne(schema, additionalData.recordId, {
                        name: vector.payload,
                        ...additionalData.updateData
                    });
                    safelyStored = response?.name === vector.payload;
                    break;

                case 'delete':
                    if (!additionalData?.recordIds) {
                        throw new Error('Delete test requires recordIds in additionalData');
                    }
                    response = await testContext.database.deleteAll(schema, 
                        additionalData.recordIds.map((id: string) => ({ id }))
                    );
                    // Delete operations don't store the payload, just verify no SQL errors
                    safelyStored = true;
                    break;
            }

        } catch (caughtError: any) {
            error = caughtError;
            const errorMessage = error.message?.toLowerCase() || '';
            
            // Check for SQL-related errors
            causedSqlError = errorMessage.includes('syntax error') || 
                           errorMessage.includes('sql') ||
                           errorMessage.includes('relation does not exist');

            // Check for database information disclosure
            revealedDatabaseInfo = errorMessage.includes('postgresql') ||
                                 errorMessage.includes('pg_') ||
                                 errorMessage.includes('information_schema');
        }

        const executionTime = Date.now() - startTime;

        return {
            success: !error || (!causedSqlError && !revealedDatabaseInfo),
            vector,
            response,
            error,
            executionTime,
            safelyStored,
            causedSqlError,
            revealedDatabaseInfo
        };
    }

    /**
     * Test multiple injection vectors against a database operation
     */
    static async testMultipleVectors(
        testContext: TestContext,
        operation: 'create' | 'update' | 'delete',
        schema: string,
        vectors: InjectionVector[],
        additionalData?: any
    ): Promise<SecurityTestResult[]> {
        const results: SecurityTestResult[] = [];

        for (const vector of vectors) {
            try {
                const result = await this.testDatabaseOperation(
                    testContext, 
                    operation, 
                    schema, 
                    vector, 
                    additionalData
                );
                results.push(result);

                // Small delay to prevent overwhelming the database
                await new Promise(resolve => setTimeout(resolve, 10));

            } catch (error) {
                results.push({
                    success: false,
                    vector,
                    error,
                    executionTime: 0,
                    safelyStored: false,
                    causedSqlError: true,
                    revealedDatabaseInfo: false
                });
            }
        }

        return results;
    }

    /**
     * Generate security test report
     */
    static generateSecurityReport(results: SecurityTestResult[]): {
        totalVectors: number;
        successfulDefenses: number;
        failedDefenses: number;
        sqlErrors: number;
        informationDisclosure: number;
        averageExecutionTime: number;
        failedVectors: InjectionVector[];
    } {
        const failedVectors = results.filter(r => !r.success).map(r => r.vector);
        const sqlErrors = results.filter(r => r.causedSqlError).length;
        const infoDisclosure = results.filter(r => r.revealedDatabaseInfo).length;
        const avgTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;

        return {
            totalVectors: results.length,
            successfulDefenses: results.filter(r => r.success).length,
            failedDefenses: results.filter(r => !r.success).length,
            sqlErrors,
            informationDisclosure: infoDisclosure,
            averageExecutionTime: avgTime,
            failedVectors
        };
    }

    /**
     * Assert comprehensive security compliance across all test results
     */
    static assertComprehensiveSecurityCompliance(results: SecurityTestResult[]): void {
        const report = this.generateSecurityReport(results);

        // Core security requirements
        expect(report.sqlErrors).toBe(0);
        expect(report.informationDisclosure).toBe(0);
        expect(report.failedDefenses).toBe(0);
        expect(report.averageExecutionTime).toBeLessThan(1000);

        // Log security test summary
        logger.info(`🔒 Security Test Summary: ${report.successfulDefenses}/${report.totalVectors} vectors defended`);
        
        if (report.failedVectors.length > 0) {
            console.error('❌ Failed injection vectors:', report.failedVectors.map(v => v.name));
        }
    }
}
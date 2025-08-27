/**
 * Security Testing Helper Functions
 *
 * Utilities for testing SQL injection protection and security validation
 * across API endpoints and database operations.
 */
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
export declare class SecurityAssertions {
    /**
     * Assert that response doesn't contain SQL error indicators
     */
    static expectNoSqlErrors(response: any, error?: any): void;
    /**
     * Assert that response doesn't reveal database structure
     */
    static expectNoDatabaseDisclosure(response: any, error?: any): void;
    /**
     * Assert that injection attempt was safely stored as data
     */
    static expectSafeStorage(storedValue: any, injectionPayload: string): void;
    /**
     * Assert that no privilege escalation occurred
     */
    static expectNoPrivilegeEscalation(response: any): void;
    /**
     * Assert that operation completed within reasonable time (no time-based attacks)
     */
    static expectNoTimingAttack(executionTime: number, maxAllowedMs?: number): void;
    /**
     * Comprehensive security validation for injection test result
     */
    static validateSecurityCompliance(result: SecurityTestResult): void;
}
/**
 * Injection testing framework for API endpoints
 */
export declare class InjectionTester {
    /**
     * Test a single injection vector against a database operation
     */
    static testDatabaseOperation(testContext: TestContext, operation: 'create' | 'update' | 'delete', schema: string, vector: InjectionVector, additionalData?: any): Promise<SecurityTestResult>;
    /**
     * Test multiple injection vectors against a database operation
     */
    static testMultipleVectors(testContext: TestContext, operation: 'create' | 'update' | 'delete', schema: string, vectors: InjectionVector[], additionalData?: any): Promise<SecurityTestResult[]>;
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
    };
    /**
     * Assert comprehensive security compliance across all test results
     */
    static assertComprehensiveSecurityCompliance(results: SecurityTestResult[]): void;
}
//# sourceMappingURL=security-helpers.d.ts.map
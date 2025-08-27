/**
 * Account Generator
 *
 * Generates realistic account records based on the account.yaml schema
 * with proper validation constraints and edge cases.
 */
import { BaseGenerator } from './base-generator.js';
import { GeneratedRecord, DataGeneratorOptions, GeneratorContext } from '@src/lib/fixtures/types.js';
export declare class AccountGenerator extends BaseGenerator {
    private readonly firstNames;
    private readonly lastNames;
    private readonly domains;
    private readonly accountTypes;
    generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[];
    /**
     * Generate username following pattern: ^[a-zA-Z0-9_-]{3,50}$
     */
    private generateUsername;
    /**
     * Generate account type with realistic distribution
     */
    private generateAccountType;
    /**
     * Generate balance (0 to 1,000,000 per schema)
     */
    private generateBalance;
    /**
     * Generate active status (90% active)
     */
    private generateActiveStatus;
    /**
     * Generate verified status (80% verified)
     */
    private generateVerifiedStatus;
    /**
     * Generate credit limit for business/premium accounts (nullable)
     */
    private generateCreditLimit;
    /**
     * Generate last login date (nullable)
     */
    private generateLastLogin;
    /**
     * Generate phone number (nullable, matching pattern)
     */
    private generatePhone;
    /**
     * Generate preferences object
     */
    private generatePreferences;
    /**
     * Generate metadata object (flexible additional data)
     */
    private generateMetadata;
    /**
     * Generate creation date
     */
    private generateCreatedDate;
    /**
     * Generate edge case records for testing boundary conditions
     */
    private generateEdgeCases;
    /**
     * No dependencies for account generation
     */
    getDependencies(): string[];
}
//# sourceMappingURL=account-generator.d.ts.map
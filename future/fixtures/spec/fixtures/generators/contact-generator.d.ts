/**
 * Contact Generator
 *
 * Generates realistic contact records based on the contact.yaml schema
 * with proper relationships and edge cases for comprehensive testing.
 */
import { BaseGenerator } from './base-generator.js';
import { GeneratedRecord, DataGeneratorOptions, GeneratorContext } from '@src/lib/fixtures/types.js';
export declare class ContactGenerator extends BaseGenerator {
    private readonly firstNames;
    private readonly lastNames;
    private readonly companies;
    private readonly jobTitles;
    private readonly contactTypes;
    private readonly statuses;
    private readonly priorities;
    private readonly sources;
    private readonly tags;
    generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[];
    /**
     * Generate contact type with realistic distribution
     */
    private generateContactType;
    /**
     * Generate status with realistic distribution
     */
    private generateStatus;
    /**
     * Generate priority with realistic distribution
     */
    private generatePriority;
    /**
     * Generate active status (85% active)
     */
    private generateActiveStatus;
    /**
     * Generate company name (nullable, max 100 chars)
     */
    private generateCompany;
    /**
     * Generate job title (nullable, max 100 chars)
     */
    private generateJobTitle;
    /**
     * Generate phone number (nullable, pattern: ^[+]?[0-9\s\-\(\)]{10,20}$)
     */
    private generatePhone;
    /**
     * Generate mobile number (nullable, different from phone)
     */
    private generateMobile;
    /**
     * Generate address object (nullable)
     */
    private generateAddress;
    /**
     * Generate source with realistic distribution
     */
    private generateSource;
    /**
     * Generate account relationship (nullable, UUID)
     */
    private generateAccountId;
    /**
     * Generate notes (nullable, max 1000 chars)
     */
    private generateNotes;
    /**
     * Generate last contacted date (nullable)
     */
    private generateLastContactedDate;
    /**
     * Generate tags array (max 10 items, each max 50 chars)
     */
    private generateTags;
    /**
     * Generate edge case records for testing boundary conditions
     */
    private generateEdgeCases;
    /**
     * Contacts depend on accounts if linking is enabled
     */
    getDependencies(): string[];
}
//# sourceMappingURL=contact-generator.d.ts.map
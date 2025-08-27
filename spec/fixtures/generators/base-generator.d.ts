/**
 * Base Data Generator
 *
 * Foundation class for all data generators with common utilities
 * for creating realistic, relationship-aware test data.
 */
import { IDataGenerator, GeneratedRecord, DataGeneratorOptions, GeneratorContext, ValidationResult } from '@src/lib/fixtures/types.js';
export declare abstract class BaseGenerator implements IDataGenerator {
    /**
     * Generate deterministic UUID from namespace and identifier
     * Ensures reproducible test data across runs
     */
    protected generateDeterministicUuid(namespace: string, identifier: string): string;
    /**
     * Generate realistic email address
     */
    protected generateRealisticEmail(firstName: string, lastName: string, domain?: string): string;
    /**
     * Generate realistic phone number
     */
    protected generatePhoneNumber(areaCode?: string): string;
    /**
     * Generate random area code (realistic US area codes)
     */
    private getRandomAreaCode;
    /**
     * Generate realistic date within range
     */
    protected generateDateInRange(startDate: Date, endDate: Date): Date;
    /**
     * Get random item from array
     */
    protected getRandomItem<T>(array: T[]): T;
    /**
     * Get multiple random items from array (without duplicates)
     */
    protected getRandomItems<T>(array: T[], count: number): T[];
    /**
     * Generate seeded random number (deterministic)
     */
    protected seededRandom(seed: string): number;
    /**
     * Find related records from previously generated data
     */
    protected findRelatedRecords(context: GeneratorContext, targetSchema: string, relationshipField: string): GeneratedRecord[];
    /**
     * Generate foreign key reference to existing record
     */
    protected generateForeignKey(context: GeneratorContext, targetSchema: string, targetField?: string): string | null;
    /**
     * Basic validation for generated records
     */
    validate(records: GeneratedRecord[], options: DataGeneratorOptions): ValidationResult;
    /**
     * Get generator dependencies (override in subclasses)
     */
    getDependencies(): string[];
    /**
     * Abstract method: generate records
     */
    abstract generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[];
}
//# sourceMappingURL=base-generator.d.ts.map
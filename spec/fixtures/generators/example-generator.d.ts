/**
 * Example Generator
 *
 * Generates example records demonstrating various field types and patterns
 * for comprehensive testing of different data scenarios.
 */
import { BaseGenerator } from './base-generator.js';
import { GeneratedRecord, DataGeneratorOptions, GeneratorContext } from '@src/lib/fixtures/types.js';
export declare class ExampleGenerator extends BaseGenerator {
    private readonly titles;
    private readonly descriptions;
    private readonly statuses;
    private readonly categories;
    private readonly tags;
    generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[];
    /**
     * Generate title with realistic variations
     */
    private generateTitle;
    /**
     * Generate description with realistic content
     */
    private generateDescription;
    /**
     * Generate status with realistic distribution
     */
    private generateStatus;
    /**
     * Generate priority (1-5)
     */
    private generatePriority;
    /**
     * Generate value with realistic distribution
     */
    private generateValue;
    /**
     * Generate percentage (0-100)
     */
    private generatePercentage;
    /**
     * Generate featured status (20% featured)
     */
    private generateFeaturedStatus;
    /**
     * Generate tags array
     */
    private generateTags;
    /**
     * Generate category with realistic distribution
     */
    private generateCategory;
    /**
     * Generate creation date
     */
    private generateCreatedDate;
    /**
     * Generate updated date (always after created date)
     */
    private generateUpdatedDate;
    /**
     * Generate expiration date (optional)
     */
    private generateExpiresAt;
    /**
     * Generate author object
     */
    private generateAuthor;
    /**
     * Generate settings object
     */
    private generateSettings;
    /**
     * Generate visibility setting
     */
    private generateVisibility;
    /**
     * Generate max revisions (1-100)
     */
    private generateMaxRevisions;
    /**
     * Generate metadata object
     */
    private generateMetadata;
    /**
     * Generate edge case records
     */
    private generateEdgeCases;
    /**
     * No dependencies for example generation
     */
    getDependencies(): string[];
}
//# sourceMappingURL=example-generator.d.ts.map
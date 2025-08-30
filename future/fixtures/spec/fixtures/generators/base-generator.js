/**
 * Base Data Generator
 *
 * Foundation class for all data generators with common utilities
 * for creating realistic, relationship-aware test data.
 */
import { createHash } from 'crypto';
import { IDataGenerator, GeneratedRecord, DataGeneratorOptions, GeneratorContext, ValidationResult } from '@src/lib/fixtures/types.js';
export class BaseGenerator {
    /**
     * Generate deterministic UUID from namespace and identifier
     * Ensures reproducible test data across runs
     */
    generateDeterministicUuid(namespace, identifier) {
        const hash = createHash('md5').update(`${namespace}:${identifier}`).digest('hex');
        return [
            hash.substr(0, 8),
            hash.substr(8, 4),
            '4' + hash.substr(12, 3), // Version 4 UUID
            '8' + hash.substr(15, 3), // Variant bits
            hash.substr(18, 12)
        ].join('-');
    }
    /**
     * Generate realistic email address
     */
    generateRealisticEmail(firstName, lastName, domain = 'example.com') {
        const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
        const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
        return `${cleanFirst}.${cleanLast}@${domain}`;
    }
    /**
     * Generate realistic phone number
     */
    generatePhoneNumber(areaCode) {
        const area = areaCode || this.getRandomAreaCode();
        const exchange = String(Math.floor(Math.random() * 800) + 200).padStart(3, '0');
        const number = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
        return `(${area}) ${exchange}-${number}`;
    }
    /**
     * Generate random area code (realistic US area codes)
     */
    getRandomAreaCode() {
        const areaCodes = ['212', '415', '718', '310', '312', '202', '404', '617', '305', '713'];
        return areaCodes[Math.floor(Math.random() * areaCodes.length)];
    }
    /**
     * Generate realistic date within range
     */
    generateDateInRange(startDate, endDate) {
        const start = startDate.getTime();
        const end = endDate.getTime();
        return new Date(start + Math.random() * (end - start));
    }
    /**
     * Get random item from array
     */
    getRandomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    /**
     * Get multiple random items from array (without duplicates)
     */
    getRandomItems(array, count) {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, array.length));
    }
    /**
     * Generate seeded random number (deterministic)
     */
    seededRandom(seed) {
        const hash = createHash('md5').update(seed).digest('hex');
        return parseInt(hash.substr(0, 8), 16) / 0xffffffff;
    }
    /**
     * Find related records from previously generated data
     */
    findRelatedRecords(context, targetSchema, relationshipField) {
        const targetData = context.existingData[targetSchema] || [];
        return targetData.filter(record => record[relationshipField] !== undefined);
    }
    /**
     * Generate foreign key reference to existing record
     */
    generateForeignKey(context, targetSchema, targetField = 'id') {
        const targetData = context.existingData[targetSchema] || [];
        if (targetData.length === 0) {
            return null;
        }
        const targetRecord = this.getRandomItem(targetData);
        return targetRecord[targetField] || null;
    }
    /**
     * Basic validation for generated records
     */
    validate(records, options) {
        const errors = [];
        const warnings = [];
        // Check for empty records
        if (records.length === 0) {
            errors.push('No records generated');
        }
        // Check for required fields (basic validation)
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            if (!record.id) {
                errors.push(`Record ${i}: Missing required 'id' field`);
            }
            // Check for null/undefined values in critical fields
            Object.entries(record).forEach(([key, value]) => {
                if (value === null || value === undefined) {
                    warnings.push(`Record ${i}: Field '${key}' is null/undefined`);
                }
            });
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            recordCounts: { [this.constructor.name]: records.length }
        };
    }
    /**
     * Get generator dependencies (override in subclasses)
     */
    getDependencies() {
        return [];
    }
}
//# sourceMappingURL=base-generator.js.map
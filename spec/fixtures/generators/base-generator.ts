/**
 * Base Data Generator
 * 
 * Foundation class for all data generators with common utilities
 * for creating realistic, relationship-aware test data.
 */

import { createHash } from 'crypto';
import { type IDataGenerator, type GeneratedRecord, type DataGeneratorOptions, type GeneratorContext, type ValidationResult } from '@src/lib/fixtures/types.js';

export abstract class BaseGenerator implements IDataGenerator {
  
  /**
   * Generate deterministic UUID from namespace and identifier
   * Ensures reproducible test data across runs
   */
  protected generateDeterministicUuid(namespace: string, identifier: string): string {
    const hash = createHash('md5').update(`${namespace}:${identifier}`).digest('hex');
    return [
      hash.substr(0, 8),
      hash.substr(8, 4), 
      '4' + hash.substr(12, 3),           // Version 4 UUID
      '8' + hash.substr(15, 3),           // Variant bits
      hash.substr(18, 12)
    ].join('-');
  }
  
  /**
   * Generate realistic email address
   */
  protected generateRealisticEmail(firstName: string, lastName: string, domain: string = 'example.com'): string {
    const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
    return `${cleanFirst}.${cleanLast}@${domain}`;
  }
  
  /**
   * Generate realistic phone number
   */
  protected generatePhoneNumber(areaCode?: string): string {
    const area = areaCode || this.getRandomAreaCode();
    const exchange = String(Math.floor(Math.random() * 800) + 200).padStart(3, '0');
    const number = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    return `(${area}) ${exchange}-${number}`;
  }
  
  /**
   * Generate random area code (realistic US area codes)
   */
  private getRandomAreaCode(): string {
    const areaCodes = ['212', '415', '718', '310', '312', '202', '404', '617', '305', '713'];
    return areaCodes[Math.floor(Math.random() * areaCodes.length)];
  }
  
  /**
   * Generate realistic date within range
   */
  protected generateDateInRange(startDate: Date, endDate: Date): Date {
    const start = startDate.getTime();
    const end = endDate.getTime();
    return new Date(start + Math.random() * (end - start));
  }
  
  /**
   * Get random item from array
   */
  protected getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  /**
   * Get multiple random items from array (without duplicates)
   */
  protected getRandomItems<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
  }
  
  /**
   * Generate seeded random number (deterministic)
   */
  protected seededRandom(seed: string): number {
    const hash = createHash('md5').update(seed).digest('hex');
    return parseInt(hash.substr(0, 8), 16) / 0xffffffff;
  }
  
  /**
   * Find related records from previously generated data
   */
  protected findRelatedRecords(
    context: GeneratorContext,
    targetSchema: string,
    relationshipField: string
  ): GeneratedRecord[] {
    const targetData = context.existingData[targetSchema] || [];
    return targetData.filter(record => record[relationshipField] !== undefined);
  }
  
  /**
   * Generate foreign key reference to existing record
   */
  protected generateForeignKey(
    context: GeneratorContext,
    targetSchema: string,
    targetField: string = 'id'
  ): string | null {
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
  validate(records: GeneratedRecord[], options: DataGeneratorOptions): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
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
  getDependencies(): string[] {
    return [];
  }
  
  /**
   * Abstract method: generate records
   */
  abstract generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[];
}
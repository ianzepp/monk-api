/**
 * Predefined Data Generator
 * 
 * Uses predefined data from fixture definitions instead of generating random data.
 * This generator is used when specific, predetermined records are needed.
 */

import type { IDataGenerator, GeneratorOptions } from './base-generator.js';

export class predefined implements IDataGenerator {
  async generate(count: number, options: GeneratorOptions = {}): Promise<Record<string, any>[]> {
    // Get predefined data from options
    const predefinedData = options.data as Record<string, any>[];
    
    if (!Array.isArray(predefinedData)) {
      throw new Error('PredefinedGenerator requires "data" array in options');
    }
    
    // Return the predefined data as-is
    // The count parameter is ignored since we use exactly the data provided
    return predefinedData;
  }
  
  /**
   * Get the actual count of records that will be generated
   * For predefined data, this is the length of the data array
   */
  getRecordCount(requestedCount: number, options: GeneratorOptions = {}): number {
    const predefinedData = options.data as Record<string, any>[];
    return Array.isArray(predefinedData) ? predefinedData.length : 0;
  }
}

// Export as default for dynamic imports  
export default predefined;
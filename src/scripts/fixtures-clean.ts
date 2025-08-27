#!/usr/bin/env tsx

/**
 * Clean Template Databases Script
 * 
 * Removes template databases by pattern or all templates.
 */

import { TemplateDatabase } from '@src/lib/fixtures/template-database.js';

async function cleanFixtures(pattern?: string): Promise<void> {
  if (pattern) {
    logger.info(`🧹 Cleaning template databases matching pattern: ${pattern}`);
  } else {
    logger.info('🧹 Cleaning all template databases...');
  }
  
  try {
    await TemplateDatabase.cleanTemplates(pattern);
    logger.info('✅ Template cleanup completed');
    
  } catch (error) {
    console.error('❌ Failed to clean template databases:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const pattern = process.argv[2]; // Get pattern from command line argument
  cleanFixtures(pattern);
}
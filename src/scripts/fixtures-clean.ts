#!/usr/bin/env tsx

/**
 * Clean Template Databases Script
 * 
 * Removes template databases by pattern or all templates.
 */

import { TemplateDatabase } from '../lib/fixtures/template-database.js';

async function cleanFixtures(pattern?: string): Promise<void> {
  if (pattern) {
    console.log(`🧹 Cleaning template databases matching pattern: ${pattern}`);
  } else {
    console.log('🧹 Cleaning all template databases...');
  }
  
  try {
    await TemplateDatabase.cleanTemplates(pattern);
    console.log('✅ Template cleanup completed');
    
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
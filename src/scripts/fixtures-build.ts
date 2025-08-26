#!/usr/bin/env tsx

/**
 * Build Template Databases Script
 * 
 * Builds template databases from fixture definitions for fast test setup.
 */

import { TemplateDatabase } from '@src/lib/fixtures/template-database.js';

async function buildFixtures(): Promise<void> {
  console.log('🔨 Building template databases...');
  
  try {
    // Build basic template
    console.log('🏗️  Building basic template...');
    await TemplateDatabase.buildTemplateFromFixture('basic');
    
    console.log('✅ Template databases built successfully');
    
  } catch (error) {
    console.error('❌ Failed to build template databases:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildFixtures();
}
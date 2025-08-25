#!/usr/bin/env tsx

/**
 * Build Template Databases Script
 * 
 * Builds template databases from fixture definitions for fast test setup.
 */

import { TemplateDatabase } from '../lib/fixtures/template-database.js';

/**
 * Convert hyphenated fixture name to camelCase for export name
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}

async function buildFixtures(): Promise<void> {
  console.log('🔨 Building template databases...');
  
  // Get fixture names from command line arguments
  const fixtureNames = process.argv.slice(2);
  
  // Default to basic if no fixtures specified
  const fixturesToBuild = fixtureNames.length > 0 ? fixtureNames : ['basic'];
  
  try {
    for (const fixtureName of fixturesToBuild) {
      console.log(`🏗️  Building ${fixtureName} template...`);
      await TemplateDatabase.buildTemplateFromFixture(fixtureName);
    }
    
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
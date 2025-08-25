#!/usr/bin/env tsx

/**
 * List Template Databases Script
 * 
 * Shows available template databases.
 */

import { TemplateDatabase } from '../lib/fixtures/template-database.js';

async function listFixtures(): Promise<void> {
  console.log('📋 Available template databases:');
  
  try {
    const templates = await TemplateDatabase.listTemplates();
    
    if (templates.length === 0) {
      console.log('  (No templates found - run `npm run fixtures:build` to create them)');
    } else {
      templates.forEach(template => console.log(`  • ${template}`));
    }
    
  } catch (error) {
    console.error('❌ Failed to list template databases:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  listFixtures();
}
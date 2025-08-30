#!/usr/bin/env tsx

/**
 * List Template Databases Script
 * 
 * Shows available template databases.
 */

import { logger } from '@src/lib/logger.js';
import { TemplateDatabase } from '@src/lib/fixtures/template-database.js';

async function listFixtures(): Promise<void> {
  logger.info('📋 Available template databases:');
  
  try {
    const templates = await TemplateDatabase.listTemplates();
    
    if (templates.length === 0) {
      logger.info('  (No templates found - run `npm run fixtures:build` to create them)');
    } else {
      templates.forEach(template => logger.info(`  • ${template}`));
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
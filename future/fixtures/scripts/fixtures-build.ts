#!/usr/bin/env tsx

/**
 * Build Template Databases Script
 *
 * Builds template databases from fixture definitions for fast test setup.
 */

import { logger } from '@src/lib/logger.js';
import { TemplateDatabase } from '@src/lib/fixtures/template-database.js';

// Set up global logger and environment for scripts
global.logger = logger;

async function buildFixtures(): Promise<void> {
    logger.info('🔨 Building template databases...');

    try {
        // Build basic template
        logger.info('🏗️  Building basic template...');
        await TemplateDatabase.buildTemplateFromFixture('basic');

        logger.info('✅ Template databases built successfully');
    } catch (error) {
        console.error('❌ Failed to build template databases:', error);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    buildFixtures();
}

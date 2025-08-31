#!/usr/bin/env tsx

/**
 * Test Template Data Script
 *
 * Creates a test tenant from a template and shows the data content.
 * Useful for validating that templates contain proper fixture data.
 */

import { logger } from '@src/lib/logger.js';
import { TemplateDatabase } from '@src/lib/fixtures/template-database.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { MonkEnv } from '@src/lib/monk-env.js';
import pg from 'pg';

// Set up global logger for scripts
global.logger = logger;

async function testTemplateData(templateName: string): Promise<void> {
    logger.info(`🔍 Testing data in template: ${templateName}`);

    try {
        // Load configuration
        MonkEnv.loadIntoProcessEnv();

        // Create test tenant from template
        const testTenantName = `test-demo-${Date.now()}`;
        const tenant = await TemplateDatabase.createTenantFromTemplate(testTenantName, templateName);
        logger.info(`✅ Created test tenant from template: ${tenant.name}`);

        // Connect to the cloned database using centralized connection
        const client = DatabaseConnection.createClient(tenant.database);
        await client.connect();

        logger.info('📋 Template database content:');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Check what schemas exist
        const schemas = await client.query('SELECT name FROM schema ORDER BY name');
        logger.info(`🏗️  Schemas (${schemas.rows.length}):`, schemas.rows.map(r => r.name).join(', '));

        // Show data from each schema
        for (const schemaRow of schemas.rows) {
            const schemaName = schemaRow.name;

            // Skip system schemas
            if (schemaName === 'schemas' || schemaName === 'users') continue;

            try {
                const countResult = await client.query(`SELECT COUNT(*) as count FROM "${schemaName}"`);
                const totalRecords = parseInt(countResult.rows[0].count);

                if (totalRecords === 0) {
                    logger.info(`📄 ${schemaName}: (empty)`);
                    continue;
                }

                logger.info(`📄 ${schemaName} (${totalRecords} records):`);
                logger.info('   ┌─────────┬──────────────────────────────────────────────────────────────────────────────────┐');
                logger.info('   │   #     │ Data Preview                                                                         │');
                logger.info('   ├─────────┼──────────────────────────────────────────────────────────────────────────────────┤');

                // Get column information
                const columns = await client.query(
                    `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `,
                    [schemaName]
                );

                // Show sample records
                const records = await client.query(`SELECT * FROM "${schemaName}" LIMIT 5`);

                records.rows.forEach((row, i) => {
                    const preview = [];

                    // Show key fields first
                    if (row.id) preview.push(`id: ${row.id.substring(0, 8)}...`);
                    if (row.name) preview.push(`name: "${row.name}"`);
                    if (row.first_name && row.last_name) preview.push(`name: "${row.first_name} ${row.last_name}"`);
                    if (row.email) preview.push(`email: "${row.email}"`);
                    if (row.company) preview.push(`company: "${row.company}"`);
                    if (row.account_type) preview.push(`type: ${row.account_type}`);
                    if (row.contact_type) preview.push(`type: ${row.contact_type}`);
                    if (row.balance !== undefined) preview.push(`balance: $${row.balance}`);
                    if (row.account_id) preview.push(`account_id: ${row.account_id.substring(0, 8)}...`);

                    const previewStr = preview.join(', ').substring(0, 75);
                    const paddedPreview = previewStr.padEnd(75);
                    logger.info(`   │   ${(i + 1).toString().padStart(2)}    │ ${paddedPreview}    │`);
                });

                if (totalRecords > 5) {
                    const remaining = totalRecords - 5;
                    logger.info(`   │         │ ... and ${remaining} more records                                                            │`);
                }

                logger.info('   └─────────┴──────────────────────────────────────────────────────────────────────────────────┘');

                // Show relationship info if applicable
                if (schemaName === 'contact') {
                    const linkedCount = await client.query('SELECT COUNT(*) as count FROM contact WHERE account_id IS NOT NULL');
                    const linkedPercent = Math.round((parseInt(linkedCount.rows[0].count) / totalRecords) * 100);
                    logger.info(`   📊 Relationships: ${linkedCount.rows[0].count}/${totalRecords} contacts linked to accounts (${linkedPercent}%)`);
                }
            } catch (schemaError) {
                const errorMessage = schemaError instanceof Error ? schemaError.message : String(schemaError);
                logger.info(`📄 ${schemaName}: (error reading data - ${errorMessage})`);
            }
        }

        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        await client.end();

        // Clean up test tenant
        logger.info('🧹 Cleaning up test tenant...');
        await TemplateDatabase.dropDatabase(tenant.database);
        logger.info('✅ Template data test completed successfully');
    } catch (error) {
        console.error('❌ Template data test failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const templateName = process.argv[2] || 'basic';
    testTemplateData(templateName);
}

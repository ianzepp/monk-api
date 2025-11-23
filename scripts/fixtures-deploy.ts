#!/usr/bin/env tsx
/**
 * Fixtures Deploy CLI
 *
 * Deploys compiled fixtures to a target database + namespace.
 *
 * Usage:
 *   npm run fixtures:deploy system -- --database db_test --schema ns_test_abc123
 *   npm run fixtures:deploy demo -- --database db_main --schema ns_tenant_xyz789
 */

// Load environment variables
import { config } from 'dotenv';
config();

import { FixtureDeployer } from '../src/lib/fixtures/deployer.js';

async function main() {
    const args = process.argv.slice(2);

    // Show help
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Fixtures Deploy Script

Usage:
  npm run fixtures:deploy <fixture> -- --database <db> --schema <schema>

Arguments:
  fixture       Name of the fixture to deploy (system, testing, demo)
  --database    Target database name (db_main, db_test, etc.)
  --schema      Target schema/namespace name (ns_tenant_*, ns_test_*, etc.)

Examples:
  npm run fixtures:deploy system -- --database db_test --schema ns_test_abc123
  npm run fixtures:deploy demo -- --database db_main --schema ns_tenant_xyz789

Note:
  The fixture must be built first with 'npm run fixtures:build <fixture>'
        `);
        process.exit(0);
    }

    // Parse arguments
    const fixtureName = args[0];
    const databaseIdx = args.indexOf('--database');
    const schemaIdx = args.indexOf('--schema');

    if (!fixtureName) {
        console.error('Error: Fixture name is required');
        console.error('Usage: npm run fixtures:deploy <fixture> -- --database <db> --schema <schema>');
        process.exit(1);
    }

    if (databaseIdx === -1 || !args[databaseIdx + 1]) {
        console.error('Error: --database parameter is required');
        process.exit(1);
    }

    if (schemaIdx === -1 || !args[schemaIdx + 1]) {
        console.error('Error: --schema parameter is required');
        process.exit(1);
    }

    const dbName = args[databaseIdx + 1];
    const nsName = args[schemaIdx + 1];

    try {
        await FixtureDeployer.deploy(fixtureName, { dbName, nsName });
        console.log(`✓ Fixture '${fixtureName}' deployed successfully`);
        process.exit(0);
    } catch (error) {
        console.error('Deploy failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();

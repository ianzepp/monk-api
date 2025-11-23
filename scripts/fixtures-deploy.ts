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
  npm run fixtures:deploy <fixture[,fixture2,...]> -- --database <db> --schema <schema>

Arguments:
  fixture       Name(s) of fixtures to deploy (comma-separated or space-separated)
                Examples: system, demo, testing
                Multiple: system,demo or system demo
  --database    Target database name (db_main, db_test, etc.)
  --schema      Target schema/namespace name (ns_tenant_*, ns_test_*, etc.)

Examples:
  # Single fixture
  npm run fixtures:deploy system -- --database db_test --schema ns_test_abc123

  # Multiple fixtures (auto-resolves dependencies)
  npm run fixtures:deploy demo -- --database db_test --schema ns_test_123
  # (automatically deploys system first, then demo)

  # Explicit multiple fixtures
  npm run fixtures:deploy system,demo -- --database db_main --schema ns_tenant_xyz

Note:
  - Fixtures must be built first with 'npm run fixtures:build <fixture>'
  - Dependencies are resolved automatically from template.json files
  - Fixtures deploy in dependency order (system always first if needed)
        `);
        process.exit(0);
    }

    // Parse arguments
    const databaseIdx = args.indexOf('--database');
    const schemaIdx = args.indexOf('--schema');

    // Collect fixture names (everything before --database or --schema)
    const endIdx = Math.min(
        databaseIdx === -1 ? Infinity : databaseIdx,
        schemaIdx === -1 ? Infinity : schemaIdx,
    );
    const fixtureArgs = args.slice(0, endIdx === Infinity ? args.length : endIdx);

    // Parse fixture names (support comma-separated or space-separated)
    const fixtureNames = fixtureArgs.flatMap((arg) => arg.split(',').map((s) => s.trim()));

    if (fixtureNames.length === 0) {
        console.error('Error: At least one fixture name is required');
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
        // Always use deployMultiple for automatic dependency resolution
        await FixtureDeployer.deployMultiple(fixtureNames, { dbName, nsName });
        console.log(`✓ All fixtures deployed successfully`);
        process.exit(0);
    } catch (error) {
        console.error('Deploy failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();

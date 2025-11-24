#!/usr/bin/env tsx
/**
 * Tenant Creation Script
 *
 * Creates a new tenant with namespace isolation and deploys fixtures.
 *
 * Usage:
 *   npm run tenant:create <tenant-name> <fixture-name>
 *   tsx scripts/tenant-create.ts <tenant-name> <fixture-name>
 *
 * Examples:
 *   npm run tenant:create mycompany system
 *   npm run tenant:create demo_sales demo
 *   tsx scripts/tenant-create.ts test_env testing
 *
 * What it does:
 * 1. Creates tenant record in monk.tenants
 * 2. Creates PostgreSQL namespace (schema) for isolation
 * 3. Deploys requested fixture to namespace
 * 4. Creates default root user (if not in fixture)
 *
 * Note: Does not generate JWT tokens - only creates tenant infrastructure
 */

// Load environment variables
import 'dotenv/config';

import { DatabaseTemplate } from '../src/lib/database-template.js';
import { DatabaseConnection } from '../src/lib/database-connection.js';

// Colors for output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
} as const;

function printStep(message: string): void {
    console.log(`${colors.blue}→ ${message}${colors.reset}`);
}

function printSuccess(message: string): void {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function printError(message: string): void {
    console.error(`${colors.red}✗ ${message}${colors.reset}`);
}

function printInfo(message: string): void {
    console.log(`${colors.yellow}ℹ ${message}${colors.reset}`);
}

function printHeader(message: string): void {
    console.log();
    console.log(`${colors.bold}${colors.blue}=== ${message} ===${colors.reset}`);
    console.log();
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Tenant Creation Script

Usage:
  npm run tenant:create <tenant-name> <fixture-name>
  tsx scripts/tenant-create.ts <tenant-name> <fixture-name>

Arguments:
  tenant-name   - Name for the new tenant (e.g., 'mycompany', 'demo_sales')
  fixture-name  - Fixture to deploy (e.g., 'system', 'demo', 'testing')

Examples:
  npm run tenant:create mycompany system
  npm run tenant:create demo_sales demo
  tsx scripts/tenant-create.ts test_env testing

What it does:
  1. Creates tenant record in monk.tenants database
  2. Creates PostgreSQL namespace (schema) for tenant isolation
  3. Deploys requested fixture with all models and data
  4. Creates default root user (if not included in fixture)

Note: This script only creates tenant infrastructure.
      JWT token generation is handled separately by the auth API.
`);
        process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
    }

    const tenantName = args[0];
    const fixtureName = args[1];
    const username = args[2] || 'root';

    printHeader('Tenant Creation');
    printInfo(`Tenant: ${tenantName}`);
    printInfo(`Fixture: ${fixtureName}`);
    printInfo(`Default User: ${username}`);
    console.log();

    try {
        printStep('Creating tenant namespace and deploying fixtures...');

        const result = await DatabaseTemplate.cloneTemplate({
            template_name: fixtureName,
            tenant_name: tenantName,
            username: username,
            user_access: 'root',
            description: `Created via tenant:create script`
        });

        printSuccess('Tenant created successfully!');
        console.log();

        printInfo('Tenant Details:');
        console.log(`  Tenant Name:    ${result.tenant}`);
        console.log(`  Database:       ${result.dbName}`);
        console.log(`  Namespace:      ${result.nsName}`);
        console.log(`  Template Used:  ${result.template_used}`);
        console.log();

        printInfo('Default User:');
        console.log(`  User ID:        ${result.user.id}`);
        console.log(`  Username:       ${result.user.auth}`);
        console.log(`  Display Name:   ${result.user.name}`);
        console.log(`  Access Level:   ${result.user.access}`);
        console.log();

        printInfo('Next Steps:');
        console.log('  1. Register user: POST /auth/register');
        console.log('  2. Login: POST /auth/login');
        console.log('  3. Access data via API endpoints');
        console.log();

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        printError(`Failed to create tenant: ${message}`);

        if (error instanceof Error && error.stack) {
            console.error();
            console.error('Stack trace:');
            console.error(error.stack);
        }

        process.exit(1);
    } finally {
        // Close database connections
        await DatabaseConnection.closeConnections();
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Fatal error: ${message}`);
        process.exit(1);
    });
}

export { main };

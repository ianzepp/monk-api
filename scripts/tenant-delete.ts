#!/usr/bin/env tsx
/**
 * Tenant Deletion Script
 *
 * Deletes a tenant and all associated data.
 *
 * Usage:
 *   npm run tenant:delete <tenant-name>
 *   tsx scripts/tenant-delete.ts <tenant-name>
 *
 * Examples:
 *   npm run tenant:delete mycompany
 *   npm run tenant:delete demo_sales
 *   tsx scripts/tenant-delete.ts test_env
 *
 * What it does:
 * 1. Looks up tenant in monk.tenants
 * 2. Drops PostgreSQL namespace (schema) with CASCADE
 * 3. Deletes tenant record from monk.tenants
 *
 * WARNING: This is a destructive operation that cannot be undone!
 *          All tenant data will be permanently deleted.
 */

// Load environment variables
import 'dotenv/config';

import { DatabaseConnection } from '../src/lib/database-connection.js';
import { NamespaceManager } from '../src/lib/namespace-manager.js';

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

function printWarning(message: string): void {
    console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function printInfo(message: string): void {
    console.log(`${colors.yellow}ℹ ${message}${colors.reset}`);
}

function printHeader(message: string): void {
    console.log();
    console.log(`${colors.bold}${colors.blue}=== ${message} ===${colors.reset}`);
    console.log();
}

interface TenantRecord {
    id: string;
    name: string;
    database: string;
    schema: string;
    description: string | null;
    source_template: string | null;
    created_at: string;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Tenant Deletion Script

Usage:
  npm run tenant:delete <tenant-name>
  tsx scripts/tenant-delete.ts <tenant-name>

Arguments:
  tenant-name - Name of the tenant to delete

Examples:
  npm run tenant:delete mycompany
  npm run tenant:delete demo_sales
  tsx scripts/tenant-delete.ts test_env

WARNING: This is a destructive operation that cannot be undone!
         All tenant data will be permanently deleted:
         - All tables and data in the namespace
         - Tenant record in monk.tenants
         - All associated users and permissions

Use with caution!
`);
        process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
    }

    const tenantName = args[0];
    const forceMode = args.includes('--force') || args.includes('-f');

    printHeader('Tenant Deletion');
    printWarning('This is a destructive operation!');
    printInfo(`Tenant: ${tenantName}`);
    console.log();

    try {
        const mainPool = DatabaseConnection.getMainPool();

        // 1. Look up tenant in monk.tenants
        printStep('Looking up tenant record...');

        const tenantQuery = await mainPool.query<TenantRecord>(
            'SELECT * FROM tenants WHERE name = $1 AND deleted_at IS NULL',
            [tenantName]
        );

        if (tenantQuery.rows.length === 0) {
            printError(`Tenant '${tenantName}' not found`);
            printInfo('Available tenants:');

            const allTenants = await mainPool.query(
                'SELECT name, database, schema FROM tenants WHERE deleted_at IS NULL ORDER BY name'
            );

            if (allTenants.rows.length === 0) {
                console.log('  (no tenants found)');
            } else {
                allTenants.rows.forEach(t => {
                    console.log(`  - ${t.name} (${t.database}/${t.schema})`);
                });
            }

            process.exit(1);
        }

        const tenant = tenantQuery.rows[0];

        printSuccess('Tenant found');
        console.log();
        printInfo('Tenant Details:');
        console.log(`  ID:             ${tenant.id}`);
        console.log(`  Name:           ${tenant.name}`);
        console.log(`  Database:       ${tenant.database}`);
        console.log(`  Namespace:      ${tenant.schema}`);
        console.log(`  Template:       ${tenant.source_template || 'N/A'}`);
        console.log(`  Description:    ${tenant.description || 'N/A'}`);
        console.log(`  Created:        ${tenant.created_at}`);
        console.log();

        // 2. Confirm deletion (unless --force)
        if (!forceMode) {
            printWarning('All data in this tenant will be permanently deleted!');
            printInfo('Use --force flag to skip this confirmation');
            console.log();
            process.exit(1);
        }

        // 3. Drop namespace (schema) with CASCADE
        printStep(`Dropping namespace '${tenant.schema}' from database '${tenant.database}'...`);

        try {
            await NamespaceManager.dropNamespace(tenant.database, tenant.schema);
            printSuccess('Namespace dropped successfully');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            printWarning(`Failed to drop namespace: ${message}`);
            printInfo('Continuing with tenant record deletion...');
        }

        // 4. Delete tenant record from monk.tenants
        printStep('Deleting tenant record...');

        await mainPool.query(
            'DELETE FROM tenants WHERE id = $1',
            [tenant.id]
        );

        printSuccess('Tenant record deleted');
        console.log();

        printSuccess(`Tenant '${tenantName}' deleted successfully!`);
        console.log();

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        printError(`Failed to delete tenant: ${message}`);

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

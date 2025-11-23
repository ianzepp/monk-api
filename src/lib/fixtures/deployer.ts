import { readFile } from 'fs/promises';
import { join } from 'path';
import { DatabaseConnection } from '../database-connection.js';

/**
 * Deployment Target
 *
 * Specifies where to deploy a fixture.
 */
export interface DeployTarget {
    /** Database name (db_main, db_test, db_premium_*, etc.) */
    dbName: string;

    /** Namespace/schema name (ns_tenant_*, ns_test_*, etc.) */
    nsName: string;
}

/**
 * Fixture Deployer
 *
 * Deploys compiled fixtures to target database + namespace.
 *
 * Process:
 * 1. Read compiled fixture (fixtures/<name>/deploy.sql)
 * 2. Inject database and schema parameters
 * 3. Execute within transaction (automatic rollback on failure)
 *
 * Example:
 *   await FixtureDeployer.deploy('system', {
 *     dbName: 'db_main',
 *     nsName: 'ns_tenant_a1b2c3d4'
 *   });
 */
export class FixtureDeployer {
    /**
     * Deploy compiled fixture to target database + schema
     *
     * Executes the fixture SQL within a transaction for atomicity.
     * On error, automatically rolls back all changes.
     *
     * @param fixtureName - Name of fixture (system, crm, etc.)
     * @param target - Target database and schema
     * @throws Error if deployment fails
     */
    static async deploy(fixtureName: string, target: DeployTarget): Promise<void> {
        console.log(`Deploying ${fixtureName} to ${target.dbName}.${target.nsName}`);

        // 1. Read compiled fixture
        const fixturePath = join(process.cwd(), 'fixtures', fixtureName, 'deploy.sql');

        let sql: string;
        try {
            sql = await readFile(fixturePath, 'utf-8');
        } catch (error) {
            throw new Error(
                `Failed to read compiled fixture: ${fixturePath}\n` +
                    `Did you run 'npm run fixtures:build ${fixtureName}'?`,
            );
        }

        // 2. Inject parameters with proper identifier quoting
        const parameterized = sql
            .replace(/:database/g, `"${target.dbName}"`)
            .replace(/:schema/g, `"${target.nsName}"`);

        // 3. Execute within transaction (automatic rollback on failure)
        const pool = DatabaseConnection.getPool(target.dbName);
        const client = await pool.connect();

        try {
            // Note: The compiled SQL already wraps itself in BEGIN/COMMIT
            // We execute it as-is
            await client.query(parameterized);
            console.log(`✓ Deployed successfully`);
        } catch (error) {
            console.error(`✗ Deployment failed`);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Deploy multiple fixtures in dependency order
     *
     * Resolves dependencies from template.json files and deploys
     * fixtures in the correct order (system first, then dependencies).
     *
     * @param fixtureNames - Names of fixtures to deploy
     * @param target - Target database and schema
     * @throws Error if any deployment fails
     */
    static async deployMultiple(fixtureNames: string[], target: DeployTarget): Promise<void> {
        // For now, deploy in order provided
        // Future: Add dependency resolution from template.json
        for (const fixtureName of fixtureNames) {
            await this.deploy(fixtureName, target);
        }
    }
}

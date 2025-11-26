import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from '../database-connection.js';
import { SqliteAdapter } from '../database/sqlite-adapter.js';
import { HttpErrors } from '../errors/http-error.js';

/**
 * Fixture metadata from template.json
 */
interface FixtureMetadata {
    name: string;
    description?: string;
    version?: string;
    is_system?: boolean;
    dependencies: string[];
    features?: string[];
}

/**
 * Deployment Target
 *
 * Specifies where to deploy a fixture.
 */
export interface DeployTarget {
    /** Database type: 'postgresql' or 'sqlite' */
    dbType: 'postgresql' | 'sqlite';

    /** Database name (db_main, db_test, db_premium_*, etc.) or SQLite directory */
    dbName: string;

    /** Namespace/schema name (ns_tenant_*, ns_test_*, etc.) or SQLite filename */
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
        console.log(`Deploying ${fixtureName} to ${target.dbName}.${target.nsName} (${target.dbType})`);

        // 1. Determine fixture file based on adapter
        const fixtureDir = join(process.cwd(), 'fixtures', fixtureName);
        const sqliteFile = join(fixtureDir, 'deploy.sqlite.sql');
        const pgFile = join(fixtureDir, 'deploy.sql');

        let fixturePath: string;
        if (target.dbType === 'sqlite') {
            // SQLite: prefer .sqlite.sql, fall back to .sql if not found
            fixturePath = existsSync(sqliteFile) ? sqliteFile : pgFile;
            if (!existsSync(sqliteFile)) {
                throw HttpErrors.internal(
                    `SQLite fixture not found: ${sqliteFile}\n` +
                        `Fixture '${fixtureName}' does not support SQLite adapter.`,
                    'DATABASE_TEMPLATE_CLONE_FAILED'
                );
            }
        } else {
            fixturePath = pgFile;
        }

        // 2. Read compiled fixture
        let sql: string;
        try {
            sql = await readFile(fixturePath, 'utf-8');
        } catch (error) {
            throw HttpErrors.internal(
                `Failed to read compiled fixture: ${fixturePath}\n` +
                    `Did you run 'npm run fixtures:build ${fixtureName}'?`,
                'DATABASE_TEMPLATE_CLONE_FAILED'
            );
        }

        // 3. Execute based on adapter type
        if (target.dbType === 'sqlite') {
            await this.deploySqlite(sql, target);
        } else {
            await this.deployPostgresql(sql, target);
        }
    }

    /**
     * Deploy fixture to PostgreSQL
     */
    private static async deployPostgresql(sql: string, target: DeployTarget): Promise<void> {
        // Inject parameters with proper identifier quoting
        const parameterized = sql
            .replace(/:database/g, `"${target.dbName}"`)
            .replace(/:schema/g, `"${target.nsName}"`);

        const pool = DatabaseConnection.getPool(target.dbName);
        const client = await pool.connect();

        try {
            // Note: The compiled SQL already wraps itself in BEGIN/COMMIT
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
     * Deploy fixture to SQLite
     */
    private static async deploySqlite(sql: string, target: DeployTarget): Promise<void> {
        const adapter = new SqliteAdapter(target.dbName, target.nsName);

        try {
            await adapter.connect();

            // Execute the SQL directly - SQLite's exec() handles multiple statements
            // The SQL already contains BEGIN/COMMIT
            const db = (adapter as any).db;
            if (!db) {
                throw new Error('SQLite adapter not connected');
            }
            db.exec(sql);

            console.log(`✓ Deployed successfully`);
        } catch (error) {
            console.error(`✗ Deployment failed`);
            throw error;
        } finally {
            await adapter.disconnect();
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
        // Resolve dependencies
        const orderedFixtures = await this.resolveDependencies(fixtureNames);

        console.log(`Deploying ${orderedFixtures.length} fixtures in dependency order: ${orderedFixtures.join(' → ')}`);

        // Deploy in resolved order
        for (const fixtureName of orderedFixtures) {
            await this.deploy(fixtureName, target);
        }
    }

    /**
     * Resolve fixture dependencies from template.json files
     *
     * Returns fixtures in dependency order (dependencies first).
     * System fixture is always included first if any fixture depends on it.
     *
     * @param requested - Fixture names requested for deployment
     * @returns Fixtures in dependency order
     * @private
     */
    private static async resolveDependencies(requested: string[]): Promise<string[]> {
        const resolved = new Set<string>();
        const visiting = new Set<string>();

        // Depth-first traversal to resolve dependencies
        const visit = async (fixtureName: string): Promise<void> => {
            if (resolved.has(fixtureName)) return;
            if (visiting.has(fixtureName)) {
                throw new Error(`Circular dependency detected: ${fixtureName}`);
            }

            visiting.add(fixtureName);

            // Read dependencies
            const metadata = await this.readFixtureMetadata(fixtureName);

            // Visit dependencies first (depth-first)
            for (const dep of metadata.dependencies) {
                await visit(dep);
            }

            visiting.delete(fixtureName);
            resolved.add(fixtureName);
        };

        // Visit all requested fixtures
        for (const fixtureName of requested) {
            await visit(fixtureName);
        }

        // Return in resolved order (Set maintains insertion order)
        return Array.from(resolved);
    }

    /**
     * Read fixture metadata from template.json
     *
     * @param fixtureName - Name of the fixture
     * @returns Fixture metadata
     * @private
     */
    private static async readFixtureMetadata(fixtureName: string): Promise<FixtureMetadata> {
        const metadataPath = join(process.cwd(), 'fixtures', fixtureName, 'template.json');

        try {
            const content = await readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(content);

            // Ensure dependencies field exists
            if (!metadata.dependencies) {
                metadata.dependencies = [];
            }

            return metadata;
        } catch (error) {
            throw HttpErrors.notFound(
                `Failed to read fixture metadata: ${metadataPath}\n` +
                    `Make sure fixtures/${fixtureName}/template.json exists`,
                'DATABASE_TEMPLATE_NOT_FOUND'
            );
        }
    }
}

import { randomBytes } from 'crypto';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from './database-connection.js';
import { DatabaseNaming } from './database-naming.js';
import { NamespaceManager } from './namespace-manager.js';
import { FixtureDeployer } from './fixtures/deployer.js';

/**
 * Semaphore to limit concurrent tenant creation operations
 *
 * Each tenant creation via createdb uses 3-5 PostgreSQL connections:
 * - Connections to template database (read)
 * - Connections to postgres system database
 * - Connections to new database (create)
 *
 * Limiting to 3 concurrent creations prevents connection exhaustion:
 * 3 operations × 5 connections = 15 connections (safe for default max_connections=100)
 */
class TenantCreationSemaphore {
    private queue: Array<() => void> = [];
    private running = 0;
    private readonly maxConcurrent: number;

    constructor(maxConcurrent: number = 3) {
        this.maxConcurrent = maxConcurrent;
    }

    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    release(): void {
        this.running--;
        const next = this.queue.shift();
        if (next) {
            this.running++;
            next();
        }
    }
}

const tenantCreationSemaphore = new TenantCreationSemaphore(3);

/**
 * Options for cloning a template database
 */
export interface TemplateCloneOptions {
    template_name: string;
    tenant_name?: string; // Optional - will be generated if not provided
    username?: string; // Optional - defaults to 'root'
    user_access?: string; // Default: 'full'
    description?: string; // Optional tenant description
    // Future extensibility:
    // email?: string;
    // company?: string;
    // plan_type?: string;
    // custom_fields?: Record<string, any>;
}

/**
 * Result of template cloning operation
 */
export interface TemplateCloneResult {
    tenant: string;
    dbName: string;
    nsName: string;
    user: {
        id: string;
        name: string;
        auth: string;
        access: string;
        access_read: string[];
        access_edit: string[];
        access_full: string[];
        access_deny: string[];
    };
    template_used: string;
}

/**
 * DatabaseTemplate - Template database cloning for fast tenant creation
 *
 * Provides template-based tenant creation for both user registration and demo environments.
 * Uses PostgreSQL CREATE DATABASE WITH TEMPLATE for sub-second tenant setup.
 */
export class DatabaseTemplate {
    /**
     * Clone a template (deploy fixture) and create a new tenant with custom user
     *
     * @param options - Template cloning configuration
     * @returns Promise<TemplateCloneResult> - New tenant credentials
     */
    static async cloneTemplate(options: TemplateCloneOptions): Promise<TemplateCloneResult> {
        const { template_name, user_access = 'root' } = options;

        // Acquire semaphore to limit concurrent tenant creations
        await tenantCreationSemaphore.acquire();

        try {
            // Get main database connection for tenant registry operations
            const mainPool = DatabaseConnection.getMainPool();

            // 1. Validate template exists (fixtures are in fixtures/ directory)
            // Note: Template validation is implicit - FixtureDeployer will fail if fixture doesn't exist

            // 2. Generate tenant name if not provided
            let tenantName = options.tenant_name;

            if (!tenantName) {
                const timestamp = Date.now();
                const random = randomBytes(4).toString('hex');
                tenantName = `demo_${timestamp}_${random}`;
            }

            // 3. Set username (defaults to 'root' if not provided)
            const username = options.username || 'root';

            // 4. Determine target database and generate namespace name
            const targetDbName = 'db_main'; // Default shared tenant database
            const targetNsName = DatabaseNaming.generateTenantNsName(tenantName);

            // 5. Check if tenant name already exists
            const existingCheck = await mainPool.query('SELECT COUNT(*) FROM tenants WHERE name = $1', [tenantName]);

            if (existingCheck.rows[0].count > 0) {
                throw HttpErrors.conflict(`Tenant '${tenantName}' already exists`, 'DATABASE_TENANT_EXISTS');
            }

            // 6. Check if namespace already exists
            if (await NamespaceManager.namespaceExists(targetDbName, targetNsName)) {
                throw HttpErrors.conflict(`Namespace '${targetNsName}' already exists in ${targetDbName}`, 'NAMESPACE_EXISTS');
            }

            // 7. Create namespace
            await NamespaceManager.createNamespace(targetDbName, targetNsName);

            try {
                // 8. Deploy fixtures to namespace with automatic dependency resolution
                // This will deploy 'system' first if the template depends on it
                await FixtureDeployer.deployMultiple([template_name], {
                    dbName: targetDbName,
                    nsName: targetNsName,
                });

                // 9. Check if user already exists (e.g., root user in fixture)
                const existingUserCheck = await DatabaseConnection.queryInNamespace(
                    targetDbName,
                    targetNsName,
                    'SELECT * FROM users WHERE auth = $1 AND deleted_at IS NULL',
                    [username]
                );

                let newUser;
                if (existingUserCheck.rows.length > 0) {
                    // User already exists in fixture - use it
                    newUser = existingUserCheck.rows[0];
                } else {
                    // Create new user in namespace
                    const userResult = await DatabaseConnection.queryInNamespace(
                        targetDbName,
                        targetNsName,
                        `INSERT INTO users (name, auth, access, access_read, access_edit, access_full, access_deny)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         RETURNING *`,
                        [`Demo User (${username})`, username, user_access, '{}', '{}', '{}', '{}']
                    );
                    newUser = userResult.rows[0];
                }

                // 10. Register tenant in main database
                const tenantInsertResult = await mainPool.query(
                    `INSERT INTO tenants (name, database, schema, description, source_template, owner_id, host, is_active)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING id`,
                    [tenantName, targetDbName, targetNsName, options.description || null, template_name, newUser.id, 'localhost', true]
                );

                return {
                    tenant: tenantName,
                    dbName: targetDbName,
                    nsName: targetNsName,
                    user: {
                        id: newUser.id,
                        name: newUser.name,
                        auth: newUser.auth,
                        access: newUser.access,
                        access_read: newUser.access_read || [],
                        access_edit: newUser.access_edit || [],
                        access_full: newUser.access_full || [],
                        access_deny: newUser.access_deny || [],
                    },
                    template_used: template_name,
                };
            } catch (error) {
                // Clean up namespace if fixture deployment or user creation failed
                try {
                    await NamespaceManager.dropNamespace(targetDbName, targetNsName);
                } catch (cleanupError) {
                    console.warn(`Failed to cleanup namespace: ${cleanupError}`);
                }
                throw error;
            }
        } finally {
            // Release semaphore to allow next tenant creation
            tenantCreationSemaphore.release();

            // Database connections are managed by DatabaseConnection class
            // No need to manually close pools here
        }
    }

    /**
     * Generate tenant database name using production hashing logic
     * (matches TenantService.tenantNameToDatabase())
     *
     * @deprecated Use DatabaseNaming.generateDatabaseName() instead
     */
    private static hashTenantName(tenantName: string): string {
        return DatabaseNaming.generateDatabaseName(tenantName);
    }
}

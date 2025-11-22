import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from './database-connection.js';
import { DatabaseNaming, TenantNamingMode } from './database-naming.js';

const execAsync = promisify(exec);

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
    database: string;
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
     * Clone a template database and create a new tenant with custom user
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
            // 1. Validate template exists in new templates table
            const templateQuery = `
                SELECT database
                  FROM templates
                 WHERE name = $1
            `;

            // Find the template by name
            const templateResult = await mainPool.query(templateQuery, [template_name]);

            if (templateResult.rows.length === 0) {
                throw HttpErrors.notFound(`Template '${template_name}' not found`, 'DATABASE_TEMPLATE_NOT_FOUND');
            }

            const templateDatabase = templateResult.rows[0].database; // monk_template_system, monk_template_testing, etc.

            // 2. Generate tenant name if not provided
            let tenantName = options.tenant_name;

            if (!tenantName) {
                const timestamp = Date.now();
                const random = randomBytes(4).toString('hex');
                tenantName = `demo_${timestamp}_${random}`;
            }

            // 3. Set username (defaults to 'root' if not provided)
            const username = options.username || 'root';

            // 4. Generate database name using SHA256 hash
            // Always uses enterprise mode for consistent, environment-isolated names
            const databaseName = DatabaseNaming.generateDatabaseName(tenantName, TenantNamingMode.ENTERPRISE);

            // 5. Check if tenant name already exists
            const existingCheck = await mainPool.query('SELECT COUNT(*) FROM tenants WHERE name = $1', [
                tenantName,
            ]);

            if (existingCheck.rows[0].count > 0) {
                throw HttpErrors.conflict(`Tenant '${tenantName}' already exists`, 'DATABASE_TENANT_EXISTS');
            }

            // 6. Check if database already exists (critical for personal mode)
            const dbExistsCheck = await mainPool.query(
                'SELECT COUNT(*) FROM pg_database WHERE datname = $1',
                [databaseName]
            );

            if (dbExistsCheck.rows[0].count > 0) {
                throw HttpErrors.conflict(
                    `Database '${databaseName}' already exists`,
                    'DATABASE_EXISTS'
                );
            }

            // 7. Clone template database using createdb command (same as test helpers)
            try {
                await execAsync(`createdb "${databaseName}" -T "${templateDatabase}"`);
            } catch (error) {
                throw HttpErrors.internal(`Failed to clone template database: ${error}`, 'DATABASE_TEMPLATE_CLONE_FAILED');
            }

            // 8. Register tenant in main database with owner_id, source_template, naming mode and description
            // Note: owner_id is set to the first user's ID (will be the user being created below)
            // This is a temporary placeholder - ideally we'd have the owner_id passed in options
            const tenantInsertResult = await mainPool.query(
                `
                INSERT INTO tenants (name, database, description, source_template, owner_id, host, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `,
                [
                    tenantName,
                    databaseName,
                    options.description || null,
                    template_name,
                    '00000000-0000-0000-0000-000000000000', // Placeholder - will update after user creation
                    'localhost',
                    true,
                ]
            );

            // 9. Add custom user to cloned database (or use existing if username exists)
            const tenantPool = DatabaseConnection.getTenantPool(databaseName);

            // Check if user already exists (e.g., root user in template)
            const existingUserCheck = await tenantPool.query(
                'SELECT * FROM users WHERE auth = $1 AND deleted_at IS NULL',
                [username]
            );

            let newUser;
            if (existingUserCheck.rows.length > 0) {
                // User already exists in template - use it
                newUser = existingUserCheck.rows[0];
            } else {
                // Create new user
                const userResult = await tenantPool.query(
                    `
                    INSERT INTO users (name, auth, access, access_read, access_edit, access_full, access_deny)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `,
                    [`Demo User (${username})`, username, user_access, '{}', '{}', '{}', '{}']
                );
                newUser = userResult.rows[0];
            }

            // 10. Update tenant owner_id to the actual user ID
            await mainPool.query(
                'UPDATE tenants SET owner_id = $1 WHERE name = $2',
                [newUser.id, tenantName]
            );

            return {
                tenant: tenantName,
                database: databaseName,
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

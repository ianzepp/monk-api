import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from './database-connection.js';
import { DatabaseNaming, TenantNamingMode } from './database-naming.js';

const execAsync = promisify(exec);

/**
 * Options for cloning a template database
 */
export interface TemplateCloneOptions {
    template_name: string;
    tenant_name?: string; // Optional - will be generated if not provided
    username?: string; // Optional - defaults to 'root' in personal mode
    user_access?: string; // Default: 'full'
    naming_mode?: 'enterprise' | 'personal'; // Database naming mode (default: enterprise or from env)
    database?: string; // Custom database name (personal mode only, defaults to sanitized tenant_name)
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
        const { template_name, user_access = 'full' } = options;

        // Get main database connection for tenant registry operations
        const mainPool = DatabaseConnection.getMainPool();

        try {
            // 1. Validate template exists
            const templateQuery = `
                SELECT database
                  FROM tenants
                 WHERE name = $1
                   AND tenant_type = 'template'
                   AND trashed_at IS NULL
            `;

            // Find the template by name, if it exists
            const templateResult = await mainPool.query(templateQuery, [`monk_${template_name}`]);

            if (templateResult.rows.length === 0) {
                throw HttpErrors.notFound(`Template '${template_name}' not found`, 'TEMPLATE_NOT_FOUND');
            }

            const templateDatabase = templateResult.rows[0].database; // monk_template_basic

            // 2. Generate tenant name if not provided
            let tenantName = options.tenant_name;

            if (!tenantName) {
                const timestamp = Date.now();
                const random = randomBytes(4).toString('hex');
                tenantName = `demo_${timestamp}_${random}`;
            }

            // 3. Determine naming mode
            const defaultMode = (process.env.TENANT_NAMING_MODE || 'enterprise') as 'enterprise' | 'personal';
            const namingMode = options.naming_mode || defaultMode;
            const mode =
                namingMode === 'personal' ? TenantNamingMode.PERSONAL : TenantNamingMode.ENTERPRISE;

            // 3a. Set default username for personal mode
            const username = options.username || (mode === TenantNamingMode.PERSONAL ? 'root' : undefined);

            if (!username) {
                throw HttpErrors.badRequest('Username is required', 'USERNAME_MISSING');
            }

            // 4. Generate database name
            let databaseName: string;

            if (mode === TenantNamingMode.PERSONAL && options.database) {
                // Personal mode with explicit database name
                databaseName = DatabaseNaming.generateDatabaseName(options.database, mode);
            } else {
                // Generate from tenant name (works for both modes)
                // In personal mode, if database not specified, uses sanitized tenant name
                databaseName = DatabaseNaming.generateDatabaseName(tenantName, mode);
            }

            // 5. Check if tenant name already exists
            const existingCheck = await mainPool.query('SELECT COUNT(*) FROM tenants WHERE name = $1', [
                tenantName,
            ]);

            if (existingCheck.rows[0].count > 0) {
                throw HttpErrors.conflict(`Tenant '${tenantName}' already exists`, 'TENANT_EXISTS');
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
                throw HttpErrors.internal(`Failed to clone template database: ${error}`, 'TEMPLATE_CLONE_FAILED');
            }

            // 8. Register tenant in main database with naming mode and description
            await mainPool.query(
                `
                INSERT INTO tenants (name, database, description, host, is_active, tenant_type, naming_mode)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
                [tenantName, databaseName, options.description || null, 'localhost', true, 'normal', namingMode]
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

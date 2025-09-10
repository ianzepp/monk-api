import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { DatabaseConnection } from './database-connection.js';

const execAsync = promisify(exec);

/**
 * Options for cloning a template database
 */
export interface TemplateCloneOptions {
    template_name: string;
    tenant_name?: string; // Optional - will be generated if not provided
    username: string;
    user_access?: string; // Default: 'full'
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
        const { template_name, username, user_access = 'full' } = options;

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
                const random = crypto.randomBytes(4).toString('hex');
                tenantName = `demo_${timestamp}_${random}`;
            }

            // 3. Generate hashed database name (matching TenantService logic)
            const databaseName = this.hashTenantName(tenantName);

            // 4. Check if tenant name already exists
            const existingCheck = await mainPool.query('SELECT COUNT(*) FROM tenants WHERE name = $1', [tenantName]);

            if (existingCheck.rows[0].count > 0) {
                throw HttpErrors.conflict(`Tenant '${tenantName}' already exists`, 'TENANT_EXISTS');
            }

            // 5. Clone template database using createdb command (same as test helpers)
            try {
                await execAsync(`createdb "${databaseName}" -T "${templateDatabase}"`);
            } catch (error) {
                throw HttpErrors.internal(`Failed to clone template database: ${error}`, 'TEMPLATE_CLONE_FAILED');
            }

            // 6. Register tenant in main database
            await mainPool.query(
                `
                INSERT INTO tenants (name, database, host, is_active, tenant_type)
                VALUES ($1, $2, $3, $4, $5)
            `,
                [tenantName, databaseName, 'localhost', true, 'normal']
            );

            // 7. Add custom user to cloned database
            const tenantPool = DatabaseConnection.getTenantPool(databaseName);

            const userResult = await tenantPool.query(
                `
                INSERT INTO users (name, auth, access, access_read, access_edit, access_full, access_deny)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `,
                [`Demo User (${username})`, username, user_access, '{}', '{}', '{}', '{}']
            );
            const newUser = userResult.rows[0];

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
     */
    private static hashTenantName(tenantName: string): string {
        const hash = crypto.createHash('sha256').update(tenantName).digest('hex').substring(0, 16);
        return `tenant_${hash}`;
    }
}

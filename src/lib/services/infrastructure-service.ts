import { exec } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { DatabaseNaming, TenantNamingMode } from '@src/lib/database-naming.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

const execAsync = promisify(exec);

/**
 * InfrastructureService - Manages templates, tenants, sandboxes, and snapshots
 *
 * This service handles all infrastructure database operations for the new four-table schema:
 * - templates: Immutable prototypes for cloning
 * - tenants: Production databases
 * - sandboxes: Temporary/experimental databases
 * - snapshots: Point-in-time backups
 */
export class InfrastructureService {
    /**
     * Get main database pool for infrastructure operations
     */
    private static getPool() {
        return DatabaseConnection.getMainPool();
    }

    // ========================================================================
    // TEMPLATES
    // ========================================================================

    /**
     * List all templates
     */
    static async listTemplates(filters?: { is_system?: boolean }) {
        const pool = this.getPool();
        const query = `
            SELECT *
            FROM templates
            ORDER BY is_system DESC, name ASC
        `;

        const result = await pool.query(query);
        return result.rows;
    }

    /**
     * Get template by name
     */
    static async getTemplate(name: string) {
        const pool = this.getPool();
        const result = await pool.query(
            `SELECT * FROM templates WHERE name = $1`,
            [name]
        );

        if (result.rows.length === 0) {
            throw HttpErrors.notFound(`Template '${name}' not found`, 'TEMPLATE_NOT_FOUND');
        }

        return result.rows[0];
    }





    // ========================================================================
    // TENANTS (Internal helpers only - no API routes)
    // ========================================================================

    /**
     * Get tenant by name (internal helper for snapshots)
     * @private
     */
    static async getTenant(name: string) {
        const pool = this.getPool();
        const result = await pool.query(
            `SELECT * FROM tenants WHERE name = $1`,
            [name]
        );

        if (result.rows.length === 0) {
            throw HttpErrors.notFound(`Tenant '${name}' not found`, 'TENANT_NOT_FOUND');
        }

        return result.rows[0];
    }

    // ========================================================================
    // SANDBOXES
    // ========================================================================

    /**
     * List all sandboxes
     */
    static async listSandboxes(filters?: { created_by?: string; is_active?: boolean }) {
        const pool = this.getPool();
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters?.created_by) {
            params.push(filters.created_by);
            conditions.push(`created_by = $${params.length}`);
        }

        if (filters?.is_active !== undefined) {
            params.push(filters.is_active);
            conditions.push(`is_active = $${params.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
            `SELECT * FROM sandboxes
             ${whereClause}
             ORDER BY created_at DESC`,
            params
        );

        return result.rows;
    }

    /**
     * Get sandbox by name
     */
    static async getSandbox(name: string) {
        const pool = this.getPool();
        const result = await pool.query(
            `SELECT * FROM sandboxes WHERE name = $1`,
            [name]
        );

        if (result.rows.length === 0) {
            throw HttpErrors.notFound(`Sandbox '${name}' not found`, 'SANDBOX_NOT_FOUND');
        }

        return result.rows[0];
    }

    /**
     * Create sandbox from template
     */
    static async createSandbox(options: {
        template_name: string;
        sandbox_name?: string;
        description?: string;
        purpose?: string;
        created_by: string;
        expires_at?: Date;
    }) {
        const pool = this.getPool();

        // Get template
        const template = await this.getTemplate(options.template_name);

        // Generate sandbox name if not provided
        const sandboxName = options.sandbox_name || `sandbox_${Date.now()}_${randomBytes(4).toString('hex')}`;

        // Generate database name
        const databaseName = `sandbox_${randomBytes(8).toString('hex')}`;

        // Check if name already exists
        const existingCheck = await pool.query(
            'SELECT COUNT(*) FROM sandboxes WHERE name = $1',
            [sandboxName]
        );

        if (existingCheck.rows[0].count > 0) {
            throw HttpErrors.conflict(
                `Sandbox '${sandboxName}' already exists`,
                'SANDBOX_EXISTS'
            );
        }

        // Clone template database
        try {
            await execAsync(`createdb "${databaseName}" -T "${template.database}"`);
        } catch (error) {
            throw HttpErrors.internal(
                `Failed to clone template database: ${error}`,
                'SANDBOX_CLONE_FAILED'
            );
        }

        // Register sandbox
        const result = await pool.query(
            `INSERT INTO sandboxes (name, database, description, purpose, parent_template, created_by, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                sandboxName,
                databaseName,
                options.description || null,
                options.purpose || null,
                options.template_name,
                options.created_by,
                options.expires_at || null,
            ]
        );

        return result.rows[0];
    }

    /**
     * Delete sandbox
     */
    static async deleteSandbox(name: string) {
        const pool = this.getPool();

        // Get sandbox details
        const sandbox = await this.getSandbox(name);

        // Drop the database
        try {
            await execAsync(`dropdb "${sandbox.database}"`);
        } catch (error) {
            throw HttpErrors.internal(
                `Failed to drop sandbox database: ${error}`,
                'SANDBOX_DROP_FAILED'
            );
        }

        // Remove from sandboxes table
        await pool.query('DELETE FROM sandboxes WHERE name = $1', [name]);

        return { success: true, deleted: name };
    }

    /**
     * Extend sandbox expiration
     */
    static async extendSandbox(name: string, expires_at: Date) {
        const pool = this.getPool();

        const result = await pool.query(
            `UPDATE sandboxes
             SET expires_at = $1, last_accessed_at = CURRENT_TIMESTAMP
             WHERE name = $2
             RETURNING *`,
            [expires_at, name]
        );

        if (result.rows.length === 0) {
            throw HttpErrors.notFound(`Sandbox '${name}' not found`, 'SANDBOX_NOT_FOUND');
        }

        return result.rows[0];
    }

    // ========================================================================
    // SNAPSHOTS
    // ========================================================================

    /**
     * List all snapshots
     */
    static async listSnapshots(filters?: { source_tenant_id?: string; created_by?: string }) {
        const pool = this.getPool();
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters?.source_tenant_id) {
            params.push(filters.source_tenant_id);
            conditions.push(`source_tenant_id = $${params.length}`);
        }

        if (filters?.created_by) {
            params.push(filters.created_by);
            conditions.push(`created_by = $${params.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
            `SELECT * FROM snapshots
             ${whereClause}
             ORDER BY created_at DESC`,
            params
        );

        return result.rows;
    }

    /**
     * Get snapshot by name
     */
    static async getSnapshot(name: string) {
        const pool = this.getPool();
        const result = await pool.query(
            `SELECT * FROM snapshots WHERE name = $1`,
            [name]
        );

        if (result.rows.length === 0) {
            throw HttpErrors.notFound(`Snapshot '${name}' not found`, 'SNAPSHOT_NOT_FOUND');
        }

        return result.rows[0];
    }

    /**
     * Create snapshot from tenant
     */
    static async createSnapshot(options: {
        tenant_name: string;
        snapshot_name?: string;
        description?: string;
        snapshot_type?: 'manual' | 'auto' | 'pre_migration' | 'scheduled';
        created_by: string;
        expires_at?: Date;
    }) {
        const pool = this.getPool();

        // Get tenant
        const tenant = await this.getTenant(options.tenant_name);

        // Generate snapshot name if not provided
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const snapshotName = options.snapshot_name || `${options.tenant_name}_${timestamp}`;

        // Generate database name
        const databaseName = `snapshot_${timestamp}_${randomBytes(4).toString('hex')}`;

        // Check if name already exists
        const existingCheck = await pool.query(
            'SELECT COUNT(*) FROM snapshots WHERE name = $1',
            [snapshotName]
        );

        if (existingCheck.rows[0].count > 0) {
            throw HttpErrors.conflict(
                `Snapshot '${snapshotName}' already exists`,
                'SNAPSHOT_EXISTS'
            );
        }

        // Clone tenant database
        try {
            await execAsync(`createdb "${databaseName}" -T "${tenant.database}"`);
        } catch (error) {
            throw HttpErrors.internal(
                `Failed to clone tenant database: ${error}`,
                'SNAPSHOT_CLONE_FAILED'
            );
        }

        // Register snapshot
        const result = await pool.query(
            `INSERT INTO snapshots (name, database, description, snapshot_type, source_tenant_id, source_tenant_name, created_by, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                snapshotName,
                databaseName,
                options.description || null,
                options.snapshot_type || 'manual',
                tenant.id,
                tenant.name,
                options.created_by,
                options.expires_at || null,
            ]
        );

        return result.rows[0];
    }

    /**
     * Delete snapshot
     */
    static async deleteSnapshot(name: string) {
        const pool = this.getPool();

        // Get snapshot details
        const snapshot = await this.getSnapshot(name);

        // Drop the database
        try {
            await execAsync(`dropdb "${snapshot.database}"`);
        } catch (error) {
            throw HttpErrors.internal(
                `Failed to drop snapshot database: ${error}`,
                'SNAPSHOT_DROP_FAILED'
            );
        }

        // Remove from snapshots table
        await pool.query('DELETE FROM snapshots WHERE name = $1', [name]);

        return { success: true, deleted: name };
    }
}

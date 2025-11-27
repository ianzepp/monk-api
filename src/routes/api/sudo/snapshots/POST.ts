import { randomBytes } from 'crypto';
import { withTransaction } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/sudo/snapshots - Create snapshot from current tenant
 *
 * Creates a point-in-time backup of the current tenant database via async observer pipeline.
 * The snapshot is created with status='pending' and an async observer handles the pg_dump process.
 *
 * Snapshots can only be created from tenant databases (not sandboxes or templates).
 * Sandboxes are temporary and should be recreated from templates/tenants instead of snapshotted.
 *
 * Request body:
 * - name (optional): Custom snapshot name
 * - description (optional): Snapshot description
 * - snapshot_type (optional): manual (default), auto, pre_migration, scheduled
 * - expires_at (optional): Retention expiration date
 *
 * Returns immediately with status='pending'. Poll GET /api/sudo/snapshots/:name for status updates.
 *
 * Requires sudo access.
 */
export default withTransaction(async ({ system, body }) => {
    const userId = system.userId;
    const tenant = system.tenant;

    // Snapshots require PostgreSQL (uses pg_dump)
    if (system.adapter?.getType() !== 'postgresql') {
        throw HttpErrors.badRequest(
            'Snapshots are only supported for PostgreSQL databases',
            'SNAPSHOT_REQUIRES_POSTGRESQL'
        );
    }

    // Get current database name by querying PostgreSQL
    const dbResult = await system.adapter.query('SELECT current_database() as name');
    const databaseName = dbResult.rows[0].name as string;

    // Verify we're snapshotting a tenant database, not a sandbox
    if (!databaseName.startsWith('tenant_')) {
        throw HttpErrors.badRequest(
            'Snapshots can only be created from tenant databases. Sandboxes are temporary and should be recreated from templates/tenants instead.',
            'SNAPSHOT_FROM_NON_TENANT'
        );
    }

    // Generate unique snapshot name and database name
    const timestamp = Date.now();
    const randomId = randomBytes(4).toString('hex');
    const snapshotName = body.name || `${tenant}_snapshot_${timestamp}`;
    const snapshotDatabase = `snapshot_${randomId}`;

    // Create snapshot record with status='pending'
    // The async observer (Ring 8) will detect this and start pg_dump
    const snapshot = await system.database.createOne('snapshots', {
        name: snapshotName,
        database: snapshotDatabase,
        description: body.description || null,
        status: 'pending',  // AsyncObserver will process this
        snapshot_type: body.snapshot_type || 'manual',
        created_by: userId,
        expires_at: body.expires_at ? new Date(body.expires_at) : null,
    });

    return {
        ...snapshot,
        message: 'Snapshot creation started in background. Poll GET /api/sudo/snapshots/:name for status updates.',
        source_database: databaseName,
    };
});

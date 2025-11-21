/**
 * Snapshot Processor - Ring 8 Integration (AsyncObserver)
 *
 * Automatically processes snapshots created with status='pending'.
 * Executes pg_dump/restore in the background without blocking API response.
 *
 * This observer runs AFTER database commit (Ring 8), ensuring that
 * snapshot records are only processed after successful creation.
 *
 * Flow:
 * 1. User POST /api/sudo/snapshots → creates record with status='pending'
 * 2. Route returns immediately (non-blocking)
 * 3. This observer detects status='pending' and spawns background pg_dump
 * 4. Updates status to 'processing' → 'active' (success) or 'failed' (error)
 * 5. User polls GET /api/sudo/snapshots/:name to check status
 *
 * Ring: 8 (Integration) - After database changes are committed
 * Schema: snapshots
 * Operations: create
 */

import { BaseAsyncObserver } from '@src/lib/observers/base-async-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

export default class SnapshotProcessor extends BaseAsyncObserver {
    readonly ring = ObserverRing.Integration;  // Ring 8
    readonly operations = ['create'] as const;
    protected readonly timeoutMs = 600000; // 10 minutes for large databases

    async execute(context: ObserverContext): Promise<void> {
        // In Ring 8, context.result contains the created records
        const snapshots = context.result || [];

        if (!Array.isArray(snapshots) || snapshots.length === 0) {
            return;
        }

        // Process each snapshot (usually just one)
        for (const snapshot of snapshots) {
            // Only process pending snapshots
            if (snapshot.status !== 'pending') {
                console.info('Skipping snapshot - not pending', {
                    snapshot_id: snapshot.id,
                    snapshot_name: snapshot.name,
                    status: snapshot.status
                });
                continue;
            }

            await this.processSnapshot(snapshot, context);
        }
    }

    private async processSnapshot(snapshot: any, context: ObserverContext): Promise<void> {
        console.info('Processing snapshot via async observer', {
            snapshot_id: snapshot.id,
            snapshot_name: snapshot.name,
            target_database: snapshot.database
        });

        try {
            // Update status to processing
            await context.system.database.updateOne('snapshots', snapshot.id, {
                status: 'processing'
            });

            // Note: We can't reliably get the source database name from the context here
            // The snapshot POST route should store source_database in the snapshot record
            // For now, we'll query the current pool's database name
            const pool = context.system.db;
            const dbResult = await pool.query('SELECT current_database() as name');
            const sourceDatabase = dbResult.rows[0].name;

            console.info('Starting pg_dump for snapshot', {
                snapshot_name: snapshot.name,
                source: sourceDatabase,
                target: snapshot.database
            });

            // Execute pg_dump/restore (long-running operation)
            const stats = await InfrastructureService.executePgDump({
                source_database: sourceDatabase,
                target_database: snapshot.database
            });

            // Step 1: Update snapshot's own database (it has stale status='pending' from pg_dump)
            await InfrastructureService.updateSnapshotMetadata({
                snapshot_id: snapshot.id,
                database: snapshot.database,
                status: 'active',
                size_bytes: stats.size_bytes,
                record_count: stats.record_count
            });

            // Step 2: Lock snapshot database as read-only (immutable backup)
            await InfrastructureService.lockSnapshotDatabase(snapshot.database);

            // Step 3: Update source tenant database (authoritative record)
            await context.system.database.updateOne('snapshots', snapshot.id, {
                status: 'active',
                size_bytes: stats.size_bytes,
                record_count: stats.record_count
            });

            console.info('Snapshot created successfully', {
                snapshot_name: snapshot.name,
                database: snapshot.database,
                size_bytes: stats.size_bytes,
                record_count: stats.record_count,
                locked: true
            });

        } catch (error) {
            console.error('Snapshot creation failed', {
                snapshot_name: snapshot.name,
                database: snapshot.database,
                error: error instanceof Error ? error.message : String(error)
            });

            // Update status to failed
            await context.system.database.updateOne('snapshots', snapshot.id, {
                status: 'failed',
                error_message: error instanceof Error ? error.message : String(error)
            });

            // Re-throw so BaseAsyncObserver logs it
            throw error;
        }
    }
}

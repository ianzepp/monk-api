/**
 * System Table Protector - Ring 3 Business Logic
 *
 * Prevents creation of models that would conflict with PostgreSQL system tables
 * or other critical system namespaces (pg_*, information_schema, etc.)
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import type { ModelRecord } from '@src/lib/model-record.js';

// System tables and models that are protected
const SYSTEM_TABLES = new Set([
    'pg_catalog',
    'information_schema',
    'pg_toast',
    'pg_temp',
    'pg_temp_1',
    'public'
]);

export default class SystemTableProtector extends BaseObserver {
    readonly ring = ObserverRing.Business;  // Ring 3
    readonly operations = ['create'] as const;

    async executeOne(record: ModelRecord, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { model_name } = record;

        if (!model_name) {
            return; // Required field validation handled elsewhere
        }

        // Check against known system tables
        if (SYSTEM_TABLES.has(model_name)) {
            throw new ValidationError(
                `Cannot create model '${model_name}': conflicts with PostgreSQL system model`,
                'model_name'
            );
        }

        // Get current namespace to check for table conflicts within this schema only
        // Note: search_path is set for regular queries, but pg_tables/information_schema
        // show ALL schemas, so we must explicitly filter by schemaname
        const nsName = system.context.get('nsName');
        if (!nsName) {
            throw new ValidationError(
                'Cannot validate table conflicts: namespace not set in context',
                'model_name'
            );
        }

        // Query PostgreSQL system catalog for table conflicts in the current schema only
        const result = await SqlUtils.getPool(system).query(
            `SELECT tablename FROM pg_tables WHERE tablename = $1 AND schemaname = $2
             UNION
             SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = $2
             LIMIT 1`,
            [model_name, nsName]
        );

        if (result.rows.length > 0) {
            throw new ValidationError(
                `Cannot create model '${model_name}': conflicts with existing table in this namespace`,
                'model_name'
            );
        }
    }
}

/**
 * System Table Protector - Ring 2 Business Logic
 *
 * Prevents creation of schemas that would conflict with PostgreSQL system tables
 * or other critical system namespaces (pg_*, information_schema, etc.)
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';

// System tables and schemas that are protected
const SYSTEM_TABLES = new Set([
    'pg_catalog',
    'information_schema',
    'pg_toast',
    'pg_temp',
    'pg_temp_1',
    'public'
]);

export default class SystemTableProtector extends BaseObserver {
    readonly ring = ObserverRing.BusinessLogic;  // Ring 2
    readonly operations = ['create'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const schemaName = record.schema_name?.toLowerCase();

        if (!schemaName) {
            return; // Required field validation handled elsewhere
        }

        // Check against known system tables
        if (SYSTEM_TABLES.has(schemaName)) {
            throw new ValidationError(
                `Cannot create schema '${schemaName}': conflicts with PostgreSQL system schema`,
                'schema_name'
            );
        }

        // Query PostgreSQL system catalog for any table/schema conflicts
        const result = await SqlUtils.getPool(system).query(
            `SELECT tablename FROM pg_tables WHERE tablename = $1
             UNION
             SELECT table_name FROM information_schema.tables WHERE table_name = $1
             LIMIT 1`,
            [schemaName]
        );

        if (result.rows.length > 0) {
            throw new ValidationError(
                `Cannot create schema '${schemaName}': conflicts with existing system table`,
                'schema_name'
            );
        }
    }
}

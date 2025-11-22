/**
 * DDL Delete Observer - Ring 6 PostDatabase
 *
 * Executes ALTER TABLE DROP COLUMN DDL after column record is soft-deleted in ring 5.
 * This permanently removes the column and all its data from the PostgreSQL table.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { isSystemField } from '@src/lib/describe.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class DdlDeleteObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['delete'] as const;
    readonly priority = 10;  // High priority - DDL should run before data transformations

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name, column_name } = record;

        // Load schema from cache to check if external
        const schema = await SchemaCache.getInstance().getSchema(system, schema_name);

        // Skip DDL operations for external schemas (managed elsewhere)
        if (schema.external === true) {
            console.info(`Skipping DDL operation for external schema column: ${schema_name}.${column_name}`);
            return;
        }

        // Skip system fields - they cannot be dropped
        if (isSystemField(column_name)) {
            console.warn(`Skipping DDL for system field: ${column_name}`);
            return;
        }

        // Generate ALTER TABLE DROP COLUMN DDL
        const ddl = `ALTER TABLE "${schema_name}" DROP COLUMN IF EXISTS "${column_name}"`;

        // Execute DDL
        try {
            await SqlUtils.getPool(system).query(ddl);
            console.info(`Dropped column from table: ${schema_name}.${column_name}`);
        } catch (error) {
            throw new SystemError(
                `Failed to drop column '${column_name}' from table '${schema_name}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

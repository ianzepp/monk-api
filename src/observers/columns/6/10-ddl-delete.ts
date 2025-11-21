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

export default class DdlDeleteObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['delete'] as const;
    readonly priority = 10;  // High priority - DDL should run before data transformations

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name: schemaName, column_name: columnName } = record;

        // Load schema from cache to check if external
        const schema = await SchemaCache.getInstance().getSchema(system, schemaName);

        // Skip DDL operations for external schemas (managed elsewhere)
        if (schema.external === true) {
            console.info(`Skipping DDL operation for external schema column: ${schemaName}.${columnName}`);
            return;
        }

        // Skip system fields - they cannot be dropped
        if (isSystemField(columnName)) {
            console.warn(`Skipping DDL for system field: ${columnName}`);
            return;
        }

        // Generate ALTER TABLE DROP COLUMN DDL
        const ddl = `ALTER TABLE "${schemaName}" DROP COLUMN IF EXISTS "${columnName}"`;

        // Execute DDL
        try {
            await SqlUtils.getPool(system).query(ddl);
            console.info(`Dropped column from table: ${schemaName}.${columnName}`);
        } catch (error) {
            throw new SystemError(
                `Failed to drop column '${columnName}' from table '${schemaName}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

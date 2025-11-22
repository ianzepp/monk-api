/**
 * DDL Delete Observer - Ring 6 PostDatabase
 *
 * Executes DROP TABLE DDL after schema record is soft-deleted in ring 5.
 * This permanently removes the table and all its data from PostgreSQL.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class DdlDeleteObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['delete'] as const;
    readonly priority = 10;  // High priority - DDL should run before data transformations

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name, external } = record;

        // Skip DDL operations for external schemas (managed elsewhere)
        if (external === true) {
            console.info(`Skipping DDL operation for external schema: ${schema_name}`);
            return;
        }

        // Generate DROP TABLE DDL
        const ddl = `DROP TABLE IF EXISTS "${schema_name}" CASCADE`;

        // Execute DDL
        try {
            await SqlUtils.getPool(system).query(ddl);
            console.info(`Dropped table for schema: ${schema_name}`);
        } catch (error) {
            throw new SystemError(
                `Failed to drop table for schema '${schema_name}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

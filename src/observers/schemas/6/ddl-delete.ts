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

export default class DdlDeleteObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['delete'] as const;
    readonly priority = 10;  // High priority - DDL should run before data transformations

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const schemaName = record.schema_name;

        // Generate DROP TABLE DDL
        const ddl = `DROP TABLE IF EXISTS "${schemaName}" CASCADE`;

        // Execute DDL
        try {
            await SqlUtils.getPool(system).query(ddl);
            logger.info(`Dropped table for schema: ${schemaName}`);
        } catch (error) {
            throw new SystemError(
                `Failed to drop table for schema '${schemaName}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

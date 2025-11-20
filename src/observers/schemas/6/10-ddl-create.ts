/**
 * DDL Create Observer - Ring 6 PostDatabase
 *
 * Executes CREATE TABLE DDL after schema record is created in ring 5.
 * Reads columns from the columns table and generates PostgreSQL table with all fields.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { isSystemField, SYSTEM_FIELDS } from '@src/lib/describe.js';
import { logger } from '@src/lib/logger.js';

export default class DdlCreateObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['create'] as const;
    readonly priority = 10;  // High priority - DDL should run before data transformations

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const schemaName = record.schema_name;

        // Skip DDL operations for external schemas (managed elsewhere)
        if (record.external === true) {
            logger.info(`Skipping DDL operation for external schema: ${schemaName}`);
            return;
        }

        try {
            let ddl = `CREATE TABLE "${schemaName}" (\n`;

            // Standard system fields
            ddl += `    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;
            ddl += `    "access_read" UUID[] DEFAULT '{}'::UUID[],\n`;
            ddl += `    "access_edit" UUID[] DEFAULT '{}'::UUID[],\n`;
            ddl += `    "access_full" UUID[] DEFAULT '{}'::UUID[],\n`;
            ddl += `    "access_deny" UUID[] DEFAULT '{}'::UUID[],\n`;
            ddl += `    "created_at" TIMESTAMP DEFAULT now() NOT NULL,\n`;
            ddl += `    "updated_at" TIMESTAMP DEFAULT now() NOT NULL,\n`;
            ddl += `    "trashed_at" TIMESTAMP,\n`;
            ddl += `    "deleted_at" TIMESTAMP`;
            ddl += `\n);`;

            logger.info('Executing DDL:');
            logger.info(ddl);

            // Execute DDL
            await SqlUtils.getPool(system).query(ddl);
            logger.info(`Created table for schema: ${schemaName}`);
        } catch (error) {
            throw new SystemError(
                `Failed to create table for schema '${schemaName}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

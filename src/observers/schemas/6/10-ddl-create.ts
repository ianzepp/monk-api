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
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class DdlCreateObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['create'] as const;
    readonly priority = 10;  // High priority - DDL should run before data transformations

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name, external } = record;

        // Skip DDL operations for external schemas (managed elsewhere)
        if (external === true) {
            console.info(`Skipping DDL operation for external schema: ${schema_name}`);
            return;
        }

        try {
            let ddl = `CREATE TABLE "${schema_name}" (\n`;

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

            console.info('Executing DDL:');
            console.info(ddl);

            // Execute DDL
            await SqlUtils.getPool(system).query(ddl);
            console.info(`Created table for schema: ${schema_name}`);
        } catch (error) {
            throw new SystemError(
                `Failed to create table for schema '${schema_name}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

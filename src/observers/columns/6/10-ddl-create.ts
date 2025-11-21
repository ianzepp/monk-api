/**
 * DDL Create Observer - Ring 6 PostDatabase
 *
 * Executes ALTER TABLE ADD COLUMN DDL after column record is created in ring 5.
 * Adds the new column to the existing table with appropriate type, constraints, and defaults.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { isSystemField } from '@src/lib/describe.js';
import { SchemaCache } from '@src/lib/schema-cache.js';

export default class DdlCreateObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['create'] as const;
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

        // Skip system fields - they're already defined in the table
        if (isSystemField(columnName)) {
            console.warn(`Skipping DDL for system field: ${columnName}`);
            return;
        }

        // Type is already PostgreSQL type (converted by Ring 4 type-mapper)
        const pgType = record.type;

        // Build column definition
        const isRequired = Boolean(record.required);
        const nullable = isRequired ? ' NOT NULL' : '';

        let defaultValue = '';
        if (record.default_value !== undefined && record.default_value !== null) {
            if (typeof record.default_value === 'string') {
                const escapedDefault = record.default_value.replace(/'/g, "''");
                defaultValue = ` DEFAULT '${escapedDefault}'`;
            } else if (typeof record.default_value === 'number') {
                defaultValue = ` DEFAULT ${record.default_value}`;
            } else if (typeof record.default_value === 'boolean') {
                defaultValue = ` DEFAULT ${record.default_value}`;
            }
        }

        // Generate ALTER TABLE ADD COLUMN DDL
        const ddl = `ALTER TABLE "${schemaName}" ADD COLUMN "${columnName}" ${pgType}${nullable}${defaultValue}`;

        // Execute DDL
        try {
            await SqlUtils.getPool(system).query(ddl);
            console.info(`Added column to table: ${schemaName}.${columnName}`);
        } catch (error) {
            throw new SystemError(
                `Failed to add column '${columnName}' to table '${schemaName}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

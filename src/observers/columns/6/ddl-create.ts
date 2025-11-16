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

/**
 * Map user-facing type to PostgreSQL type
 */
const TYPE_MAPPING: Record<string, string> = {
    'text': 'text',
    'integer': 'integer',
    'decimal': 'numeric',
    'boolean': 'boolean',
    'timestamp': 'timestamp',
    'date': 'date',
    'uuid': 'uuid',
    'jsonb': 'jsonb',
    'text[]': 'text[]',
    'integer[]': 'integer[]',
    'decimal[]': 'numeric[]',
    'uuid[]': 'uuid[]',
} as const;

function mapUserTypeToPgType(userType: string): string {
    return TYPE_MAPPING[userType] || userType;
}

export default class DdlCreateObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['create'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name: schemaName, column_name: columnName } = record;

        // Skip system fields - they're already defined in the table
        if (isSystemField(columnName)) {
            logger.warn(`Skipping DDL for system field: ${columnName}`);
            return;
        }

        // Map user-facing type to PostgreSQL type
        const pgType = mapUserTypeToPgType(record.type);

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
            logger.info(`Added column to table: ${schemaName}.${columnName}`);
        } catch (error) {
            throw new SystemError(
                `Failed to add column '${columnName}' to table '${schemaName}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

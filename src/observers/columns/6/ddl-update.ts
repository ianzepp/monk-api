/**
 * DDL Update Observer - Ring 6 PostDatabase
 *
 * Executes ALTER TABLE ALTER COLUMN DDL after column record is updated in ring 5.
 * Handles type changes, required/NOT NULL changes, and default value changes.
 *
 * Note: This observer needs access to BOTH old and new column data to determine
 * what DDL operations are needed. The context.metadata should contain the old record.
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

export default class DdlUpdateObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['update'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name: schemaName, column_name: columnName } = record;

        // Skip system fields - they cannot be altered
        if (isSystemField(columnName)) {
            logger.warn(`Skipping DDL for system field: ${columnName}`);
            return;
        }

        // Get old column data from metadata (preloaded by ring 0 record-preloader)
        const oldRecord = context.metadata.get('preloaded_records')?.[0];

        if (!oldRecord) {
            logger.warn(`No old record found for column update: ${schemaName}.${columnName}`);
            return;
        }

        const ddlCommands: string[] = [];

        // Handle type change
        const oldPgType = mapUserTypeToPgType(oldRecord.type);
        const newPgType = mapUserTypeToPgType(record.type);

        if (oldPgType !== newPgType) {
            ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" TYPE ${newPgType}`);
        }

        // Handle required (NOT NULL) change
        const oldRequired = Boolean(oldRecord.required);
        const newRequired = Boolean(record.required);

        if (oldRequired !== newRequired) {
            if (newRequired) {
                ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" SET NOT NULL`);
            } else {
                ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" DROP NOT NULL`);
            }
        }

        // Handle default value change
        const oldDefault = oldRecord.default_value;
        const newDefault = record.default_value;

        if (oldDefault !== newDefault) {
            if (newDefault === null || newDefault === undefined) {
                // Remove default
                ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" DROP DEFAULT`);
            } else {
                // Set new default
                let defaultValue: string;
                if (typeof newDefault === 'string') {
                    const escapedDefault = newDefault.replace(/'/g, "''");
                    defaultValue = `'${escapedDefault}'`;
                } else {
                    defaultValue = String(newDefault);
                }
                ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" SET DEFAULT ${defaultValue}`);
            }
        }

        // Execute all DDL commands
        if (ddlCommands.length === 0) {
            logger.debug(`No DDL changes needed for column: ${schemaName}.${columnName}`);
            return;
        }

        for (const ddl of ddlCommands) {
            try {
                await SqlUtils.getPool(system).query(ddl);
                logger.info(`Altered column: ${schemaName}.${columnName} - ${ddl}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to alter column '${columnName}' in table '${schemaName}': ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }
}

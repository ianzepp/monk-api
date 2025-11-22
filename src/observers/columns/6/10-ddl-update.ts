/**
 * DDL Update Observer - Ring 6 PostDatabase
 *
 * Executes ALTER TABLE ALTER COLUMN DDL after column record is updated in ring 5.
 * Handles type changes, required/NOT NULL changes, and default value changes.
 *
 * Uses SchemaRecord's change tracking (changed(), get(), getOriginal()) to detect
 * what DDL operations are needed.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { isSystemField } from '@src/lib/describe.js';
import { SchemaCache } from '@src/lib/schema-cache.js';

export default class DdlUpdateObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['update'] as const;
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

        // Skip system fields - they cannot be altered
        if (isSystemField(columnName)) {
            console.warn(`Skipping DDL for system field: ${columnName}`);
            return;
        }

        const ddlCommands: string[] = [];

        // Handle type change using SchemaRecord's change tracking
        // Types are already PostgreSQL types (converted by Ring 4 type-mapper)
        if (record.changed('type')) {
            const newPgType = record.get('type');
            ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" TYPE ${newPgType}`);
        }

        // Handle required (NOT NULL) change
        if (record.changed('required')) {
            const newRequired = Boolean(record.get('required'));
            if (newRequired) {
                ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" SET NOT NULL`);
            } else {
                ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" DROP NOT NULL`);
            }
        }

        // Handle default value change
        if (record.changed('default_value')) {
            const newDefault = record.get('default_value');
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
            console.debug(`No DDL changes needed for column: ${schemaName}.${columnName}`);
            return;
        }

        for (const ddl of ddlCommands) {
            try {
                await SqlUtils.getPool(system).query(ddl);
                console.info(`Altered column: ${schemaName}.${columnName} - ${ddl}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to alter column '${columnName}' in table '${schemaName}': ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }
}

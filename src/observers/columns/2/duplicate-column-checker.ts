/**
 * Duplicate Column Checker - Ring 2 Business Logic
 *
 * Checks if a column with the same name already exists in the schema.
 * Provides better error message than database unique constraint violation.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';

export default class DuplicateColumnChecker extends BaseObserver {
    readonly ring = ObserverRing.BusinessLogic;  // Ring 2
    readonly operations = ['create'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name: schemaName, column_name: columnName } = record;

        if (!schemaName || !columnName) {
            return; // Required field validation handled elsewhere
        }

        // Check if column already exists in this schema
        const result = await SqlUtils.getPool(system).query(
            'SELECT column_name FROM columns WHERE schema_name = $1 AND column_name = $2 LIMIT 1',
            [schemaName, columnName]
        );

        if (result.rows.length > 0) {
            throw new ValidationError(
                `Column '${columnName}' already exists in schema '${schemaName}'`,
                'column_name'
            );
        }
    }
}

/**
 * Duplicate Schema Checker - Ring 3 Business Logic
 *
 * Checks if a schema with the same name already exists in the database.
 * Provides better error message than database unique constraint violation.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';

export default class DuplicateSchemaChecker extends BaseObserver {
    readonly ring = ObserverRing.Business;  // Ring 3
    readonly operations = ['create'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const schemaName = record.schema_name;

        if (!schemaName) {
            return; // Required field validation handled elsewhere
        }

        // Check if schema already exists
        const result = await SqlUtils.getPool(system).query(
            'SELECT schema_name FROM schemas WHERE schema_name = $1 LIMIT 1',
            [schemaName]
        );

        if (result.rows.length > 0) {
            throw new ValidationError(
                `Schema '${schemaName}' already exists`,
                'schema_name'
            );
        }
    }
}

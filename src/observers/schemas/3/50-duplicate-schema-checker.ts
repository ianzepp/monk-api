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
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class DuplicateSchemaChecker extends BaseObserver {
    readonly ring = ObserverRing.Business;  // Ring 3
    readonly operations = ['create'] as const;

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name } = record;

        if (!schema_name) {
            return; // Required field validation handled elsewhere
        }

        // Check if schema already exists
        const result = await SqlUtils.getPool(system).query(
            'SELECT schema_name FROM schemas WHERE schema_name = $1 LIMIT 1',
            [schema_name]
        );

        if (result.rows.length > 0) {
            throw new ValidationError(
                `Schema '${schema_name}' already exists`,
                'schema_name'
            );
        }
    }
}

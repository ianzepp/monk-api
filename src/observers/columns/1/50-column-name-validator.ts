/**
 * Column Name Validator - Ring 1 Input Validation
 *
 * Validates column names for SQL safety and PostgreSQL compatibility.
 * Prevents SQL injection, reserved words, system field conflicts, and invalid identifiers.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import { SYSTEM_COLUMNS } from '@src/lib/schema.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';

// PostgreSQL reserved words
const RESERVED_WORDS = new Set([
    'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
    'authorization', 'between', 'binary', 'both', 'case', 'cast', 'check', 'collate',
    'collation', 'column', 'constraint', 'create', 'cross', 'current_catalog',
    'current_date', 'current_role', 'current_schema', 'current_time', 'current_timestamp',
    'current_user', 'system', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end',
    'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant',
    'group', 'having', 'ilike', 'in', 'initially', 'inner', 'intersect', 'into', 'is',
    'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime',
    'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only',
    'or', 'order', 'outer', 'overlaps', 'placing', 'primary', 'references', 'returning',
    'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 'table', 'then',
    'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose',
    'when', 'where', 'window', 'with'
]);

export default class column_nameValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;  // Ring 1
    readonly operations = ['create', 'update'] as const;

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { column_name } = record;

        if (!column_name) {
            return; // Required field validation handled by Ajv
        }

        // Validate length
        if (column_name.length > 63) {
            throw new ValidationError(
                'Column name must be 63 characters or less (PostgreSQL identifier limit)',
                'column_name'
            );
        }

        // Validate format: lowercase letters, numbers, underscores only
        if (!/^[a-z][a-z0-9_]*$/.test(column_name)) {
            throw new ValidationError(
                'Column name must start with a letter and contain only lowercase letters, numbers, and underscores',
                'column_name'
            );
        }

        // Check for system field conflicts
        if (SYSTEM_COLUMNS.has(column_name.toLowerCase())) {
            throw new ValidationError(
                `Column name '${column_name}' conflicts with system field`,
                'column_name'
            );
        }

        // Check for reserved words
        if (RESERVED_WORDS.has(column_name.toLowerCase())) {
            throw new ValidationError(
                `Column name '${column_name}' is a PostgreSQL reserved word`,
                'column_name'
            );
        }

        // Prevent double underscores (often used for system fields)
        if (column_name.includes('__')) {
            throw new ValidationError(
                'Column name cannot contain double underscores (reserved for system use)',
                'column_name'
            );
        }
    }
}

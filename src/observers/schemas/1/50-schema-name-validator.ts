/**
 * Schema Name Validator - Ring 1 Input Validation
 *
 * Validates schema names for SQL safety and PostgreSQL compatibility.
 * Prevents SQL injection, reserved words, and invalid identifier patterns.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';

// PostgreSQL reserved words that should not be used as schema names
const RESERVED_WORDS = new Set([
    'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
    'authorization', 'between', 'binary', 'both', 'case', 'cast', 'check', 'collate',
    'collation', 'column', 'constraint', 'create', 'cross', 'current_catalog',
    'current_date', 'current_role', 'current_schema', 'current_time', 'current_timestamp',
    'current_user', 'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end',
    'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant',
    'group', 'having', 'ilike', 'in', 'initially', 'inner', 'intersect', 'into', 'is',
    'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime',
    'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only',
    'or', 'order', 'outer', 'overlaps', 'placing', 'primary', 'references', 'returning',
    'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 'table', 'then',
    'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose',
    'when', 'where', 'window', 'with'
]);

// System table prefixes that should not be used
const SYSTEM_PREFIXES = ['pg_', 'information_schema', 'sql_', 'sys_'];

export default class SchemaNameValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;  // Ring 1
    readonly operations = ['create', 'update'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const schemaName = record.schema_name;

        if (!schemaName) {
            return; // Required field validation handled by Ajv
        }

        // Validate length
        if (schemaName.length > 63) {
            throw new ValidationError(
                'Schema name must be 63 characters or less (PostgreSQL identifier limit)',
                'schema_name'
            );
        }

        // Validate format: lowercase letters, numbers, underscores only
        if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
            throw new ValidationError(
                'Schema name must start with a letter and contain only lowercase letters, numbers, and underscores',
                'schema_name'
            );
        }

        // Check for reserved words
        if (RESERVED_WORDS.has(schemaName.toLowerCase())) {
            throw new ValidationError(
                `Schema name '${schemaName}' is a PostgreSQL reserved word`,
                'schema_name'
            );
        }

        // Check for system prefixes
        for (const prefix of SYSTEM_PREFIXES) {
            if (schemaName.toLowerCase().startsWith(prefix)) {
                throw new ValidationError(
                    `Schema name cannot start with reserved prefix '${prefix}'`,
                    'schema_name'
                );
            }
        }

        // Prevent double underscores (often used for system schemas)
        if (schemaName.includes('__')) {
            throw new ValidationError(
                'Schema name cannot contain double underscores (reserved for system use)',
                'schema_name'
            );
        }
    }
}

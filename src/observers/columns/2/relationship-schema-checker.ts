/**
 * Relationship Schema Checker - Ring 2 Business Logic
 *
 * Validates that related_schema exists when creating a relationship column.
 * Ensures referential integrity before DDL execution.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';

export default class RelationshipSchemaChecker extends BaseObserver {
    readonly ring = ObserverRing.BusinessLogic;  // Ring 2
    readonly operations = ['create', 'update'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { relationship_type, related_schema, relationship_name } = record;

        // Skip if not a relationship column
        if (!relationship_type) {
            return;
        }

        // Validate required relationship fields
        if (!related_schema) {
            throw new ValidationError(
                'related_schema is required when relationship_type is set',
                'related_schema'
            );
        }

        if (!relationship_name) {
            throw new ValidationError(
                'relationship_name is required when relationship_type is set',
                'relationship_name'
            );
        }

        // Validate relationship_type value
        if (!['owned', 'referenced'].includes(relationship_type)) {
            throw new ValidationError(
                `Invalid relationship_type '${relationship_type}'. Must be 'owned' or 'referenced'`,
                'relationship_type'
            );
        }

        // Check if related schema exists
        const result = await SqlUtils.getPool(system).query(
            'SELECT schema_name FROM schemas WHERE schema_name = $1 AND status IN ($2, $3) LIMIT 1',
            [related_schema, 'active', 'system']
        );

        if (result.rows.length === 0) {
            throw new ValidationError(
                `Related schema '${related_schema}' does not exist or is not active`,
                'related_schema'
            );
        }
    }
}

/**
 * Column Sudo Validator - Field-Level Sudo Protection Observer
 *
 * Ensures that operations modifying sudo-protected columns require explicit sudo token.
 * This provides field-level granular security within schemas - allows regular operations
 * on most fields while protecting sensitive columns.
 *
 * Complements schema-level sudo (SudoValidator) which protects entire schemas.
 * This validator allows fine-grained control: normal users can update most fields,
 * but changing sensitive fields (salary, pricing, security settings) requires sudo.
 *
 * Performance:
 * - Zero database queries: uses Schema.getSudoFields() from cached column metadata
 * - O(n × m) where n=records, m=changed fields (typically small)
 * - Precalculated Set<string> for O(1) sudo field lookup
 *
 * Use cases:
 * - Salary fields in HR systems (update employee, but sudo for salary)
 * - Pricing fields in e-commerce (update product, but sudo for price)
 * - Security settings (update profile, but sudo for 2FA changes)
 * - Financial fields (update account, but sudo for credit limit)
 *
 * Ring 1 (Input Validation) - Priority 25 (after freeze, before immutable)
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SecurityError } from '@src/lib/observers/errors.js';

export default class ColumnSudoValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update'] as const;
    readonly priority = 25;

    async execute(context: ObserverContext): Promise<void> {
        const { schema, system, data, operation } = context;
        const schemaName = schema.schema_name;

        // Check if data exists
        if (!data || data.length === 0) {
            return;
        }

        // Get sudo-protected fields from cached schema metadata (O(1))
        const sudoFields = schema.getSudoFields();

        // No sudo-protected fields defined - skip validation
        if (sudoFields.size === 0) {
            return;
        }

        // Check if user has sudo token
        const jwtPayload = system.context.get('jwtPayload');
        const hasSudo = jwtPayload?.is_sudo === true;

        // Track which sudo fields are being modified
        const sudoFieldsModified: Set<string> = new Set();

        // Check each record for sudo field modifications
        for (const record of data) {
            // Convert to plain object to iterate fields
            const plainRecord = record.toObject();

            // Check each field in the record
            for (const fieldName of Object.keys(plainRecord)) {
                // Skip non-sudo fields
                if (!sudoFields.has(fieldName)) {
                    continue;
                }

                // Sudo field is being modified
                sudoFieldsModified.add(fieldName);
            }
        }

        // If sudo fields are being modified but user lacks sudo token
        if (sudoFieldsModified.size > 0 && !hasSudo) {
            const fieldList = Array.from(sudoFieldsModified).join(', ');

            console.warn(`Blocked ${operation} on sudo-protected fields`, {
                schemaName,
                operation,
                sudoFields: Array.from(sudoFieldsModified),
                recordCount: data?.length || 0,
                userId: system.getUser?.()?.id
            });

            throw new SecurityError(
                `Cannot modify sudo-protected fields [${fieldList}] without sudo access. ` +
                `Use POST /api/user/sudo to get short-lived sudo token before modifying these fields.`,
                { fields: Array.from(sudoFieldsModified) }, // Context with affected fields
                'FIELD_REQUIRES_SUDO'
            );
        }

        // Either no sudo fields modified, or user has valid sudo token
        if (sudoFieldsModified.size > 0) {
            console.info('Sudo access validated for protected fields', {
                schemaName,
                operation,
                sudoFields: Array.from(sudoFieldsModified),
                recordCount: data?.length || 0,
                userId: system.getUser?.()?.id,
                elevation_reason: jwtPayload.elevation_reason
            });
        }
    }
}

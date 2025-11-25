/**
 * Enum Validator
 *
 * Validates that field values are in their allowed enum list.
 * Supports nullable fields (allows null for non-required fields).
 */

import type { ValidationError } from './required.js';

/**
 * Validate that field values are in their allowed enum lists
 *
 * @param record - The record being validated
 * @param recordIndex - Index of the record in the batch (for error reporting)
 * @param enumFields - Map of field names to their allowed values
 * @returns Array of validation errors (empty if valid)
 */
export function validateEnums(
    record: Record<string, any>,
    recordIndex: number,
    enumFields: Map<string, string[]>
): ValidationError[] {
    const errors: ValidationError[] = [];

    // Early exit if no enum fields
    if (enumFields.size === 0) {
        return errors;
    }

    // Iterate only over fields present in the record that have enums
    for (const [fieldName, value] of Object.entries(record)) {
        // Skip if field has no enum constraint
        const allowedValues = enumFields.get(fieldName);
        if (!allowedValues || allowedValues.length === 0) {
            continue;
        }

        // Allow null/undefined for non-required fields
        // (required validator will catch if field is actually required)
        if (value === null || value === undefined) {
            continue;
        }

        // Check if value is in allowed list
        // Note: This is case-sensitive comparison
        if (!allowedValues.includes(value)) {
            errors.push({
                record: recordIndex,
                field: fieldName,
                message: `Field '${fieldName}' value '${value}' is not in allowed list: [${allowedValues.join(', ')}]`,
                code: 'INVALID_ENUM_VALUE',
            });
        }
    }

    return errors;
}

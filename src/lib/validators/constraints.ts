/**
 * Constraints Validator
 *
 * Validates numeric ranges (minimum/maximum) and string patterns (regex).
 * Uses pre-compiled RegExp patterns from Model for performance.
 */

import type { ValidationError } from './required.js';

export interface ConstraintInfo {
    minimum?: number;
    maximum?: number;
    pattern?: RegExp;
}

/**
 * Validate that field values meet their constraint requirements
 *
 * @param record - The record being validated
 * @param recordIndex - Index of the record in the batch (for error reporting)
 * @param rangeFields - Map of field names to their constraint info (min/max/pattern)
 * @returns Array of validation errors (empty if valid)
 */
export function validateConstraints(
    record: Record<string, any>,
    recordIndex: number,
    rangeFields: Map<string, ConstraintInfo>
): ValidationError[] {
    const errors: ValidationError[] = [];

    // Early exit if no constraint fields
    if (rangeFields.size === 0) {
        return errors;
    }

    // Iterate only over fields present in the record that have constraints
    for (const [fieldName, value] of Object.entries(record)) {
        // Skip if field has no constraints
        const constraints = rangeFields.get(fieldName);
        if (!constraints) {
            continue;
        }

        // Allow null/undefined for non-required fields
        if (value === null || value === undefined) {
            continue;
        }

        // Validate minimum constraint
        if (constraints.minimum !== undefined) {
            const numValue = Number(value);
            if (!isNaN(numValue) && numValue < constraints.minimum) {
                errors.push({
                    record: recordIndex,
                    field: fieldName,
                    message: `Field '${fieldName}' value ${numValue} is less than minimum ${constraints.minimum}`,
                    code: 'VALUE_BELOW_MINIMUM',
                });
            }
        }

        // Validate maximum constraint
        if (constraints.maximum !== undefined) {
            const numValue = Number(value);
            if (!isNaN(numValue) && numValue > constraints.maximum) {
                errors.push({
                    record: recordIndex,
                    field: fieldName,
                    message: `Field '${fieldName}' value ${numValue} is greater than maximum ${constraints.maximum}`,
                    code: 'VALUE_ABOVE_MAXIMUM',
                });
            }
        }

        // Validate pattern constraint (regex)
        if (constraints.pattern) {
            const strValue = String(value);
            if (!constraints.pattern.test(strValue)) {
                errors.push({
                    record: recordIndex,
                    field: fieldName,
                    message: `Field '${fieldName}' value '${strValue}' does not match required pattern ${constraints.pattern.source}`,
                    code: 'PATTERN_MISMATCH',
                });
            }
        }
    }

    return errors;
}

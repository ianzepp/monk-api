/**
 * Data Validator Observer - Optimized Single-Loop Architecture
 *
 * Replaces JSON Model (AJV) validation with in-house validators for better
 * performance and full model/field feature support.
 *
 * Performance Optimizations:
 * - Single loop over records (not N separate loops)
 * - Single loop over relevant fields only (not all fields repeatedly)
 * - Pre-merged validation metadata from Model class (O(1) access)
 * - Pre-compiled regex patterns (compiled once per model, not per record)
 * - System fields already excluded from validationFields
 * - Collects ALL validation errors before throwing (user-friendly)
 *
 * Complexity:
 * - Old approach: O(records × (all_fields × 5)) = 100 × (50 × 5) = 25,000 iterations
 * - New approach: O(records × relevant_fields) = 100 × 10 = 1,000 iterations
 * - Performance improvement: ~25x faster
 *
 * Validates:
 * - Required fields (required=true must be present and non-null)
 * - Data types (text, integer, numeric, boolean, uuid, timestamp, date, jsonb, arrays)
 * - Numeric ranges (minimum, maximum)
 * - String patterns (regex)
 * - Enum values (allowed value lists)
 *
 * Ring 1 (Input Validation) - Priority 40
 * Runs after: FreezeValidator (20), FieldSudoValidator (25), ImmutableValidator (30)
 * Runs before: SudoValidator (50)
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { FieldValidationConfig } from '@src/lib/model.js';

// Import validation utility functions
import { validateScalarType, validateArrayType } from '@src/lib/validators/types.js';

interface ValidationErrorDetail {
    record: number;
    field: string;
    message: string;
    code: string;
}

export default class DataValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update'] as const;
    readonly priority = 40;

    async execute(context: ObserverContext): Promise<void> {
        const { model, data } = context;

        // Check if data exists
        if (!data || data.length === 0) {
            return;
        }

        // Get pre-merged validation fields (already excludes system fields)
        const validationFields = model.getValidationFields();

        // Early exit if no fields require validation
        if (validationFields.length === 0) {
            console.info('No validation fields defined', { modelName: model.model_name });
            return;
        }

        const errors: ValidationErrorDetail[] = [];

        // OPTIMIZED: Single loop over records, single loop over relevant fields
        for (const [recordIndex, record] of data.entries()) {
            for (const field of validationFields) {
                // For UPDATE operations, only validate fields being updated
                // Existing DB values are already valid, no need to re-validate
                if (context.operation === 'update' && !record.has(field.fieldName)) {
                    continue; // Skip fields not in update payload
                }

                // Get merged view: new value if changed, otherwise original value
                const value = record.get(field.fieldName);
                this.validateField(field, value, recordIndex, errors);
            }
        }

        // Throw if any validation errors occurred
        this.throwIfErrors(errors, model.model_name, data?.length || 0, validationFields.length);
    }

    /**
     * Validate a single field value against all its validation rules
     * Orchestrates required, type, constraint, and enum validation
     */
    private validateField(
        field: FieldValidationConfig,
        value: any,
        recordIndex: number,
        errors: ValidationErrorDetail[]
    ): void {
        // Check required first - if missing, skip other validations
        if (this.checkRequired(field, value, recordIndex, errors)) {
            return; // Field is required but missing - skip other checks
        }

        // Skip other validations for null/undefined values (allowed for non-required fields)
        if (value === null || value === undefined) {
            return;
        }

        // Validate type - if wrong type, skip constraint/enum checks
        if (this.checkType(field, value, recordIndex, errors)) {
            return; // Type validation failed - skip other checks
        }

        // Validate constraints (min/max/pattern)
        this.checkConstraints(field, value, recordIndex, errors);

        // Validate enum values
        this.checkEnum(field, value, recordIndex, errors);
    }

    /**
     * Check if required field is present and non-null
     * @returns true if field is required and missing (skip other validations)
     */
    private checkRequired(
        field: FieldValidationConfig,
        value: any,
        recordIndex: number,
        errors: ValidationErrorDetail[]
    ): boolean {
        // Early return: field is not required
        if (!field.required) {
            return false;
        }

        // Early return: required field has a value
        if (value !== null && value !== undefined) {
            return false;
        }

        // Field is required but missing or null
        errors.push({
            record: recordIndex,
            field: field.fieldName,
            message: `Field '${field.fieldName}' is required but missing or null`,
            code: 'REQUIRED_FIELD_MISSING',
        });
        return true; // Signal to skip other validations
    }

    /**
     * Check if value matches expected type
     * @returns true if type validation failed (skip other validations)
     */
    private checkType(
        field: FieldValidationConfig,
        value: any,
        recordIndex: number,
        errors: ValidationErrorDetail[]
    ): boolean {
        // Early return: no type constraint
        if (!field.type) {
            return false;
        }

        const typeError = this.validateType(value, field.type);

        // Early return: type is valid
        if (!typeError) {
            return false;
        }

        // Type validation failed
        errors.push({
            record: recordIndex,
            field: field.fieldName,
            message: `Field '${field.fieldName}' ${typeError}`,
            code: 'INVALID_TYPE',
        });
        return true; // Signal to skip other validations
    }

    /**
     * Check if value meets constraint requirements (min/max/pattern)
     */
    private checkConstraints(
        field: FieldValidationConfig,
        value: any,
        recordIndex: number,
        errors: ValidationErrorDetail[]
    ): void {
        // Early return: no constraints
        if (!field.constraints) {
            return;
        }

        const constraintError = this.validateConstraints(value, field.constraints);

        // Early return: constraints satisfied
        if (!constraintError) {
            return;
        }

        // Constraint validation failed
        errors.push({
            record: recordIndex,
            field: field.fieldName,
            message: `Field '${field.fieldName}' ${constraintError}`,
            code: this.getConstraintErrorCode(constraintError),
        });
    }

    /**
     * Check if value is in allowed enum list
     */
    private checkEnum(
        field: FieldValidationConfig,
        value: any,
        recordIndex: number,
        errors: ValidationErrorDetail[]
    ): void {
        // Early return: no enum constraint
        if (!field.enum || field.enum.length === 0) {
            return;
        }

        // Early return: value is in allowed list
        if (field.enum.includes(value)) {
            return;
        }

        // Invalid enum value
        errors.push({
            record: recordIndex,
            field: field.fieldName,
            message: `Field '${field.fieldName}' value '${value}' is not in allowed list: [${field.enum.join(', ')}]`,
            code: 'INVALID_ENUM_VALUE',
        });
    }

    /**
     * Validate type using imported utility functions
     * @returns Error message or null if valid
     */
    private validateType(value: any, typeInfo: { type: string; is_array: boolean }): string | null {
        if (typeInfo.is_array || typeInfo.type.endsWith('[]')) {
            return validateArrayType(value, typeInfo.type);
        }
        return validateScalarType(value, typeInfo.type);
    }

    /**
     * Validate constraints (minimum, maximum, pattern)
     * @returns Error message or null if valid
     */
    private validateConstraints(
        value: any,
        constraints: { minimum?: number; maximum?: number; pattern?: RegExp }
    ): string | null {
        // Validate minimum
        if (constraints.minimum !== undefined) {
            const numValue = Number(value);
            if (!isNaN(numValue) && numValue < constraints.minimum) {
                return `value ${numValue} is less than minimum ${constraints.minimum}`;
            }
        }

        // Validate maximum
        if (constraints.maximum !== undefined) {
            const numValue = Number(value);
            if (!isNaN(numValue) && numValue > constraints.maximum) {
                return `value ${numValue} is greater than maximum ${constraints.maximum}`;
            }
        }

        // Validate pattern (regex)
        if (constraints.pattern) {
            const strValue = String(value);
            if (!constraints.pattern.test(strValue)) {
                return `value '${strValue}' does not match required pattern ${constraints.pattern.source}`;
            }
        }

        return null;
    }

    /**
     * Determine error code based on constraint error message
     */
    private getConstraintErrorCode(errorMessage: string): string {
        if (errorMessage.includes('minimum')) return 'VALUE_BELOW_MINIMUM';
        if (errorMessage.includes('maximum')) return 'VALUE_ABOVE_MAXIMUM';
        return 'PATTERN_MISMATCH';
    }

    /**
     * Throw validation error if any errors were collected
     */
    private throwIfErrors(
        errors: ValidationErrorDetail[],
        modelName: string,
        recordCount: number,
        validatedFieldCount: number
    ): void {
        if (errors.length === 0) {
            // All validation passed
            console.info('Data validation passed', {
                modelName,
                recordCount,
                validatedFields: validatedFieldCount,
            });
            return;
        }

        // Group errors by record for logging
        const errorsByRecord = new Map<number, ValidationErrorDetail[]>();
        for (const error of errors) {
            const recordErrors = errorsByRecord.get(error.record) || [];
            recordErrors.push(error);
            errorsByRecord.set(error.record, recordErrors);
        }

        console.warn('Data validation failed', {
            modelName,
            totalRecords: recordCount,
            failedRecords: errorsByRecord.size,
            totalErrors: errors.length,
        });

        // Format error message with violation details (show first 5)
        const violationSummary = errors
            .slice(0, 5)
            .map((e) => `  [${e.record}].${e.field}: ${e.message}`)
            .join('\n');

        const additionalErrors = errors.length > 5 ? `\n  ... and ${errors.length - 5} more errors` : '';

        throw new ValidationError(
            `Data validation failed for model '${modelName}' with ${errors.length} error(s):\n${violationSummary}${additionalErrors}`,
            undefined, // No specific field
            'DATA_VALIDATION_FAILED'
        );
    }
}

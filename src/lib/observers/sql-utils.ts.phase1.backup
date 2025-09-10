import crypto from 'crypto';

import { SystemError } from '@src/lib/observers/errors.js';
import { logger } from '@src/lib/logger.js';

/**
 * SQL Observer Utilities
 *
 * Shared utilities for SQL observers including PostgreSQL type conversion,
 * JSONB field processing, UUID array handling, and database context management.
 */

export class SqlUtils {
    /**
     * Convert PostgreSQL string results back to proper JSON types
     *
     * PostgreSQL returns all values as strings by default. This method converts
     * them back to the correct JSON types based on the schema definition.
     */
    static convertPostgreSQLTypes(record: any, schema: any): any {
        if (!schema.definition?.properties) {
            return record;
        }

        const converted = { ...record };
        const properties = schema.definition.properties;

        for (const [fieldName, fieldDef] of Object.entries(properties)) {
            if (converted[fieldName] !== null && converted[fieldName] !== undefined) {
                const fieldDefinition = fieldDef as any;

                switch (fieldDefinition.type) {
                    case 'number':
                    case 'integer':
                        if (typeof converted[fieldName] === 'string') {
                            converted[fieldName] = Number(converted[fieldName]);
                        }
                        break;

                    case 'boolean':
                        if (typeof converted[fieldName] === 'string') {
                            converted[fieldName] = converted[fieldName] === 'true';
                        }
                        break;

                    case 'object':
                    case 'array':
                        // JSONB fields: PostgreSQL returns these as already parsed objects/arrays
                        // but in some cases they might come back as strings, so handle both
                        if (typeof converted[fieldName] === 'string') {
                            try {
                                converted[fieldName] = JSON.parse(converted[fieldName]);
                            } catch (error) {
                                // If JSON parsing fails, leave as string
                                // This handles edge cases where JSONB might return malformed data
                                logger.warn('Failed to parse JSONB field', {
                                    fieldName,
                                    error: error instanceof Error ? error.message : String(error),
                                });
                            }
                        }
                        // If already an object/array, leave as-is (normal PostgreSQL JSONB behavior)
                        break;

                    // Strings and dates can remain as strings
                }
            }
        }

        return converted;
    }

    /**
     * Process UUID arrays for PostgreSQL compatibility
     *
     * Converts JavaScript arrays to PostgreSQL array literals for UUID fields
     * based on metadata flags set by UuidArrayProcessor in Ring 4.
     */
    static processUuidArrays(record: any, metadata: Map<string, any>): any {
        const processed = { ...record };

        // Check each potential UUID array field
        const uuidFields = ['access_read', 'access_edit', 'access_full', 'access_deny'];

        for (const fieldName of uuidFields) {
            if (metadata.get(`${fieldName}_is_uuid_array`) && Array.isArray(processed[fieldName])) {
                // Convert JavaScript array to PostgreSQL array literal
                processed[fieldName] = `{${processed[fieldName].join(',')}}`;
            }
        }

        return processed;
    }

    /**
     * Process JSONB fields for PostgreSQL compatibility
     *
     * Converts JavaScript objects and arrays to JSON strings for JSONB columns
     * based on schema field type definitions (type: object or type: array).
     */
    static processJsonbFields(record: any, schema: any): any {
        if (!schema.definition?.properties) {
            return record;
        }

        const processed = { ...record };
        const properties = schema.definition.properties;

        for (const [fieldName, fieldDef] of Object.entries(properties)) {
            const fieldDefinition = fieldDef as any;

            // Check if this is a JSONB field (object or array type)
            if (fieldDefinition.type === 'object' || fieldDefinition.type === 'array') {
                const value = processed[fieldName];

                // Only process non-null values that aren't already strings
                if (value !== null && value !== undefined && typeof value !== 'string') {
                    try {
                        processed[fieldName] = JSON.stringify(value);
                    } catch (error) {
                        throw new SystemError(`Failed to serialize JSONB field '${fieldName}': ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        }

        return processed;
    }

    /**
     * Get transaction-aware database context
     * Uses transaction if available, otherwise uses database connection
     */
    static getPool(system: any): any {
        return system.tx || system.db;
    }

    /**
     * Generate UUID for new records
     */
    static generateId(): string {
        return crypto.randomUUID();
    }
}

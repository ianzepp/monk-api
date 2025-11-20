import crypto from 'crypto';

import { SystemError } from '@src/lib/observers/errors.js';
import { convertRecordPgToMonk, convertRecordMonkToPg } from '@src/lib/column-types.js';

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
     * them back to the correct JSON types based on the schema column metadata.
     */
    static convertPostgreSQLTypes(record: any, schema: any): any {
        if (!schema.typedFields || schema.typedFields.size === 0) {
            return record;
        }

        return convertRecordPgToMonk(record, schema.typedFields);
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
     * based on schema column type definitions.
     */
    static processJsonbFields(record: any, schema: any): any {
        if (!schema.typedFields || schema.typedFields.size === 0) {
            return record;
        }

        try {
            return convertRecordMonkToPg(record, schema.typedFields);
        } catch (error) {
            throw new SystemError(error instanceof Error ? error.message : String(error));
        }
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

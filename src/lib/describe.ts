import type { System } from '@src/lib/system.js';
import { DescribeSchemas } from '@src/lib/describe-schemas.js';
import { DescribeColumns } from '@src/lib/describe-columns.js';

export interface JsonSchemaProperty {
    type: string;
    format?: string;
    pattern?: string;
    enum?: string[];
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    default?: any;
    description?: string;
    'x-monk-relationship'?: {
        type: 'owned' | 'referenced';
        schema: string;
        name: string;
        column?: string;
        cascadeDelete?: boolean;
        required?: boolean;
    };
}

export interface JsonSchema {
    name: string;
    title: string;
    table?: string;
    description?: string;
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
}

/**
 * System fields that are automatically added to all tables by the PaaS platform.
 * These fields should not be included in user-defined schemas as they are managed by the system.
 */
export const SYSTEM_FIELDS = [
    'id', // UUID primary key
    'access_read', // Read access control list
    'access_edit', // Edit access control list
    'access_full', // Full access control list
    'access_deny', // Deny access control list
    'created_at', // Record creation timestamp
    'updated_at', // Last update timestamp
    'trashed_at', // Soft delete timestamp
    'deleted_at', // Hard delete timestamp
] as const;

export type SystemField = (typeof SYSTEM_FIELDS)[number];

/**
 * Helper function to check if a field name is a system field
 */
export function isSystemField(fieldName: string): boolean {
    return SYSTEM_FIELDS.includes(fieldName as SystemField);
}

/**
 * Strip system fields from schema/column records before returning to client
 *
 * Removes all internal system fields including id.
 * Describe API is name-based (schema_name, column_name), not ID-based.
 * Mutates records in-place for O(n) performance.
 *
 * @param input Single record or array of records
 * @returns Cleaned record(s) with system fields removed
 */
export function stripSystemFields<T extends Record<string, any>>(record: T): T;
export function stripSystemFields<T extends Record<string, any>>(records: T[]): T[];
export function stripSystemFields<T extends Record<string, any>>(input: T | T[]): T | T[] {
    const strip = (record: T): T => {
        // Hard-coded system fields for O(1) per-record deletion
        delete record.id;
        delete record.access_read;
        delete record.access_edit;
        delete record.access_full;
        delete record.access_deny;
        delete record.created_at;
        delete record.updated_at;
        delete record.trashed_at;
        delete record.deleted_at;
        return record;
    };

    if (Array.isArray(input)) {
        return input.map(strip);
    }
    return strip(input);
}

/**
 * Describe Class - Schema Definition Management
 *
 * Provides high-level interface for schema and column operations.
 * Delegates to DescribeSchemas and DescribeColumns wrapper classes.
 */
export class Describe {
    public readonly schemas: DescribeSchemas;
    public readonly columns: DescribeColumns;

    constructor(private system: System) {
        this.schemas = new DescribeSchemas(system);
        this.columns = new DescribeColumns(system);
    }
}

// Base field interface shared by all tables
export interface BaseFields {
    id: string;
    domain: string | null; // Nullable - null means public/shared
    access_read: string[]; // UUID arrays for ACL
    access_edit: string[];
    access_full: string[];
    access_deny: string[];
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    trashed_at: string | null; // ISO timestamp for soft deletes
    deleted_at: string | null; // ISO timestamp for permanent deletes
}

// Schema registry table interface
export interface Schema extends BaseFields {
    name: string; // Unique schema name
    table_name: string; // Unique table name
    status: 'pending' | 'active' | 'disabled'; // Schema status
    definition: any; // JSON Schema object
    field_count: string; // Number of fields
    json_checksum: string | null; // SHA256 checksum for cache validation
}

// Column registry table interface
export interface Column extends BaseFields {
    schema_name: string; // References schema.name
    column_name: string; // Column name
    pg_type: string; // PostgreSQL column type
    is_required: 'true' | 'false'; // Required flag as string
    default_value: string | null; // Default value if any
    constraints: any | null; // JSON Schema constraints object
    foreign_key: any | null; // Foreign key metadata object
    description: string | null; // Column description
}

// Insert types (for creating new records)
export type NewSchema = Omit<Schema, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
};

export type NewColumn = Omit<Column, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
};

// Table names as constants
export const TABLE_NAMES = {
    schemas: 'schemas',
    columns: 'columns',
} as const;

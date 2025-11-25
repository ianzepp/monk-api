// Base field interface shared by all tables
export interface BaseFields {
    id: string;
    domain?: string | null; // Nullable - null means public/shared
    access_read: string[]; // UUID arrays for ACL
    access_edit: string[];
    access_full: string[];
    access_deny: string[];
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    trashed_at: string | null; // ISO timestamp for soft deletes
    deleted_at: string | null; // ISO timestamp for permanent deletes
}

// Model registry table interface
export interface Model extends BaseFields {
    model_name: string; // Unique model name
    status: 'pending' | 'active' | 'disabled' | 'system'; // Model status
}

// Field registry table interface
export interface Field extends BaseFields {
    model_name: string; // References model.model_name
    field_name: string; // Field name
    type: string; // PostgreSQL field type
    required: 'true' | 'false'; // Required flag as string
    default_value: string | null; // Default value if any
    constraints: any | null; // Field constraints metadata
    foreign_key: any | null; // Foreign key metadata object
    description: string | null; // Field description
}

// Insert types (for creating new records)
export type NewModel = Omit<Model, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
};

export type NewField = Omit<Field, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
};

// Table names as constants
export const TABLE_NAMES = {
    model: 'models',
    fields: 'fields',
} as const;

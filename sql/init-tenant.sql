-- Monk API Required Schema Tables
-- These tables are required for the Hono API to function correctly

-- Enable pgcrypto extension for checksum generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum type for column data types
CREATE TYPE column_type AS ENUM (
    'text',
    'integer',
    'numeric',
    'boolean',
    'jsonb',
    'uuid',
    'timestamp',
    'date',
    'text[]',
    'integer[]',
    'numeric[]',
    'uuid[]'
);

-- Schema registry table to store schema metadata
CREATE TABLE "schemas" (
    -- System
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,

	-- Implementation
	"schema_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sudo" boolean DEFAULT false NOT NULL,

	-- Constraints
	CONSTRAINT "schema_name_unique" UNIQUE("schema_name")
);

-- Column registry table to store individual field metadata
CREATE TABLE "columns" (
    -- System
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,

	-- Implementation
	"schema_name" text NOT NULL,
	"column_name" text NOT NULL,
	"type" column_type NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"description" text,

	-- Relationships
	"relationship_type" text,
	"related_schema" text,
	"related_column" text,
	"relationship_name" text,
	"cascade_delete" boolean DEFAULT false,
	"required_relationship" boolean DEFAULT false,

	-- Restrictions
	"minimum" numeric,
	"maximum" numeric,
	"pattern" text,
	"enum_values" text[],
	"is_array" boolean DEFAULT false
);

-- Add foreign key constraint
ALTER TABLE "columns" ADD CONSTRAINT "columns_schemas_name_schema_name_fk"
    FOREIGN KEY ("schema_name") REFERENCES "public"."schemas"("schema_name")
    ON DELETE no action ON UPDATE no action;

-- Add unique index for schema+column combination
CREATE UNIQUE INDEX "idx_columns_schema_column"
    ON "columns" ("schema_name", "column_name");

-- Users table to store tenant users and their access levels (1-db-per-tenant)
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"auth" text NOT NULL,
	"access" text CHECK ("access" IN ('root', 'full', 'edit', 'read', 'deny')) NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "users_auth_unique" UNIQUE("auth")
);

-- Insert self-reference row to enable recursive schema discovery via data API
-- This allows GET /api/data/schemas to work by querying the schemas table itself
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES (
    'schemas',
    'system',
    true
);

-- Insert self-reference row to enable recursive schema discovery via data API
-- This allows GET /api/data/columns to work by querying the columns table itself
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES (
    'columns',
    'system',
    true
);

-- Insert user schema registration to enable user API access
-- This allows GET /api/data/users to work
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES (
    'users',
    'system',
    true
);

-- ============================================================================
-- Column Definitions for System Schemas
-- ============================================================================
-- These define the portable (non-system) columns for the core schemas.
-- System fields (id, access_*, created_at, etc.) are automatically added
-- to all tables and should NOT be included here.

-- Column definitions for 'schemas' schema
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('schemas', 'schema_name', 'text', true, 'Unique name for the schema'),
    ('schemas', 'status', 'text', true, 'Schema status (pending, active, system)'),
    ('schemas', 'sudo', 'boolean', true, 'Whether schema modifications require sudo access');

-- Column definitions for 'columns' schema
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('columns', 'schema_name', 'text', true, 'Name of the schema this column belongs to'),
    ('columns', 'column_name', 'text', true, 'Name of the column'),
    ('columns', 'type', 'text', true, 'Data type of the column'),
    ('columns', 'required', 'boolean', true, 'Whether the column is required (NOT NULL)'),
    ('columns', 'default_value', 'text', false, 'Default value for the column'),
    ('columns', 'description', 'text', false, 'Human-readable description of the column'),
    ('columns', 'relationship_type', 'text', false, 'Type of relationship (owned, referenced)'),
    ('columns', 'related_schema', 'text', false, 'Related schema for relationships'),
    ('columns', 'related_column', 'text', false, 'Related column for relationships'),
    ('columns', 'relationship_name', 'text', false, 'Name of the relationship'),
    ('columns', 'cascade_delete', 'boolean', false, 'Whether to cascade delete on relationship'),
    ('columns', 'required_relationship', 'boolean', false, 'Whether the relationship is required'),
    ('columns', 'minimum', 'numeric', false, 'Minimum value constraint for numeric columns'),
    ('columns', 'maximum', 'numeric', false, 'Maximum value constraint for numeric columns'),
    ('columns', 'pattern', 'text', false, 'Regular expression pattern for validation'),
    ('columns', 'enum_values', 'text[]', false, 'Allowed enum values'),
    ('columns', 'is_array', 'boolean', false, 'Whether the column is an array type');

-- Column definitions for 'users' schema
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('users', 'name', 'text', true, 'User display name'),
    ('users', 'auth', 'text', true, 'Authentication identifier'),
    ('users', 'access', 'text', true, 'User access level (root, full, edit, read, deny)');

-- ============================================================================
-- Utility Function: Create Table from Schema Definition
-- ============================================================================
-- This function reads from schemas/columns tables and generates/executes DDL
-- to create the actual data table with proper system fields and indexes.

CREATE OR REPLACE FUNCTION create_table_from_schema(p_schema_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_ddl TEXT;
    v_column RECORD;
    v_column_def TEXT;
    v_default_value TEXT;
    v_first_column BOOLEAN := TRUE;
BEGIN
    -- Check if schema exists
    IF NOT EXISTS (SELECT 1 FROM schemas WHERE schema_name = p_schema_name) THEN
        RAISE EXCEPTION 'Schema % does not exist in schemas table', p_schema_name;
    END IF;

    -- Start CREATE TABLE statement
    v_ddl := format('CREATE TABLE IF NOT EXISTS %I (', p_schema_name);
    v_ddl := v_ddl || E'\n';

    -- Add standard system fields
    v_ddl := v_ddl || '    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),' || E'\n';
    v_ddl := v_ddl || '    "access_read" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "access_edit" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "access_full" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "access_deny" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "created_at" TIMESTAMP DEFAULT now() NOT NULL,' || E'\n';
    v_ddl := v_ddl || '    "updated_at" TIMESTAMP DEFAULT now() NOT NULL,' || E'\n';
    v_ddl := v_ddl || '    "trashed_at" TIMESTAMP,' || E'\n';
    v_ddl := v_ddl || '    "deleted_at" TIMESTAMP,' || E'\n';

    -- Add custom columns from columns table
    FOR v_column IN
        SELECT column_name, type, required, default_value
        FROM columns
        WHERE schema_name = p_schema_name
        ORDER BY column_name
    LOOP
        v_column_def := format('    %I %s', v_column.column_name, v_column.type);

        -- Add NOT NULL constraint if required
        IF v_column.required = 'true' THEN
            v_column_def := v_column_def || ' NOT NULL';
        END IF;

        -- Add DEFAULT value if specified
        IF v_column.default_value IS NOT NULL THEN
            -- Handle different types of default values
            CASE v_column.type
                WHEN 'boolean' THEN
                    v_column_def := v_column_def || format(' DEFAULT %s', v_column.default_value);
                WHEN 'integer', 'numeric' THEN
                    v_column_def := v_column_def || format(' DEFAULT %s', v_column.default_value);
                WHEN 'text', 'timestamp' THEN
                    v_column_def := v_column_def || format(' DEFAULT %L', v_column.default_value);
                ELSE
                    v_column_def := v_column_def || format(' DEFAULT %L', v_column.default_value);
            END CASE;
        END IF;

        v_ddl := v_ddl || v_column_def || ',' || E'\n';
    END LOOP;

    -- Remove trailing comma and newline, add closing parenthesis
    v_ddl := rtrim(v_ddl, ',' || E'\n') || E'\n);';

    -- Execute the DDL
    EXECUTE v_ddl;

    -- Create standard indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (created_at)',
        p_schema_name || '_created_at_idx', p_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (updated_at)',
        p_schema_name || '_updated_at_idx', p_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (deleted_at) WHERE deleted_at IS NULL',
        p_schema_name || '_deleted_at_idx', p_schema_name);

    -- Update schema status to active
    UPDATE schemas SET status = 'active' WHERE schema_name = p_schema_name;

    RETURN format('Table %I created successfully', p_schema_name);
END;
$$ LANGUAGE plpgsql;

-- Monk API Default Template Initialization Script
-- This script creates the complete default template database (monk_default)
--
-- Usage:
--   createdb monk_default
--   psql -d monk_default -f sql/init-template-default.sql
--
-- This template contains:
-- - Core system tables (schemas, columns, users, history, definitions)
-- - System schema definitions and metadata
-- - Default user (root)
-- - JSON Schema generation functions and triggers
--
-- The default template serves as the base for all new tenants and sandboxes,
-- providing the minimal infrastructure needed for the Monk API to function.

-- ============================================================================
-- PART 1: CORE INFRASTRUCTURE TABLES
-- ============================================================================
-- Based on sql/init-tenant.sql

-- Enable pgcrypto extension for checksum generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum type for column data types
CREATE TYPE column_type AS ENUM (
    'text',
    'integer',
    'bigserial',
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
	"description" text,
	"sudo" boolean DEFAULT false NOT NULL,
	"freeze" boolean DEFAULT false NOT NULL,
	"immutable" boolean DEFAULT false NOT NULL,

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
	"is_array" boolean DEFAULT false,
	"immutable" boolean DEFAULT false NOT NULL,
	"sudo" boolean DEFAULT false NOT NULL,
	"unique" boolean DEFAULT false NOT NULL,
	"index" boolean DEFAULT false NOT NULL,
	"tracked" boolean DEFAULT false NOT NULL,

	-- Search and Transform
	"searchable" boolean DEFAULT false NOT NULL,
	"transform" text
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

-- Snapshots table for point-in-time backups
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" VARCHAR(255) NOT NULL UNIQUE,
	"database" VARCHAR(255) NOT NULL UNIQUE,
	"description" TEXT,
	"status" VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (
		"status" IN ('pending', 'processing', 'active', 'failed')
	),
	"snapshot_type" VARCHAR(20) DEFAULT 'manual' NOT NULL CHECK (
		"snapshot_type" IN ('manual', 'auto', 'pre_migration', 'scheduled')
	),
	"size_bytes" BIGINT,
	"record_count" INTEGER,
	"error_message" TEXT,
	"created_by" uuid NOT NULL,
	"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" TIMESTAMP,
	"trashed_at" TIMESTAMP,
	"deleted_at" TIMESTAMP,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	CONSTRAINT "snapshots_database_prefix" CHECK ("database" LIKE 'snapshot_%')
);

CREATE INDEX "idx_snapshots_status" ON "snapshots" ("status");
CREATE INDEX "idx_snapshots_type" ON "snapshots" ("snapshot_type");
CREATE INDEX "idx_snapshots_created_by" ON "snapshots" ("created_by");
CREATE INDEX "idx_snapshots_created_at" ON "snapshots" ("created_at");
CREATE INDEX "idx_snapshots_expires" ON "snapshots" ("expires_at") WHERE "expires_at" IS NOT NULL;
CREATE INDEX "idx_snapshots_trashed" ON "snapshots" ("trashed_at") WHERE "trashed_at" IS NOT NULL;

-- ============================================================================
-- PART 2: SYSTEM SCHEMA REGISTRATIONS
-- ============================================================================

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

-- Insert history schema registration for change tracking
-- This enables audit trail for tracked columns across all schemas
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES (
    'history',
    'system',
    true
);

-- Insert snapshots schema registration for point-in-time backups
-- This enables snapshot management via observer pipeline
INSERT INTO "schemas" (schema_name, status, sudo, description)
VALUES (
    'snapshots',
    'system',
    true,
    'Point-in-time database backups created via async observer pipeline'
);

-- ============================================================================
-- PART 3: COLUMN DEFINITIONS FOR SYSTEM SCHEMAS
-- ============================================================================
-- These define the portable (non-system) columns for the core schemas.
-- System fields (id, access_*, created_at, etc.) are automatically added
-- to all tables and should NOT be included here.

-- Column definitions for 'schemas' schema
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('schemas', 'schema_name', 'text', true, 'Unique name for the schema'),
    ('schemas', 'status', 'text', false, 'Schema status (pending, active, system)'),
    ('schemas', 'description', 'text', false, 'Human-readable description of the schema'),
    ('schemas', 'sudo', 'boolean', false, 'Whether schema modifications require sudo access'),
    ('schemas', 'freeze', 'boolean', false, 'Whether all data changes are prevented on this schema'),
    ('schemas', 'immutable', 'boolean', false, 'Whether records are write-once (can be created but never modified)');

-- Column definitions for 'columns' schema
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('columns', 'schema_name', 'text', true, 'Name of the schema this column belongs to'),
    ('columns', 'column_name', 'text', true, 'Name of the column'),
    ('columns', 'type', 'text', true, 'Data type of the column'),
    ('columns', 'required', 'boolean', false, 'Whether the column is required (NOT NULL)'),
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
    ('columns', 'is_array', 'boolean', false, 'Whether the column is an array type'),
    ('columns', 'immutable', 'boolean', false, 'Whether the column value cannot be changed once set'),
    ('columns', 'sudo', 'boolean', false, 'Whether modifying this column requires sudo access'),
    ('columns', 'unique', 'boolean', false, 'Whether the column must have unique values'),
    ('columns', 'index', 'boolean', false, 'Whether to create a standard btree index on this column'),
    ('columns', 'tracked', 'boolean', false, 'Whether changes to this column are tracked in history'),
    ('columns', 'searchable', 'boolean', false, 'Whether to enable full-text search with GIN index'),
    ('columns', 'transform', 'text', false, 'Auto-transform values: lowercase, uppercase, trim, normalize_phone, normalize_email');

-- Column definitions for 'users' schema
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('users', 'name', 'text', true, 'User display name'),
    ('users', 'auth', 'text', true, 'Authentication identifier'),
    ('users', 'access', 'text', true, 'User access level (root, full, edit, read, deny)');

-- Column definitions for 'history' schema
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('history', 'change_id', 'bigserial', true, 'Auto-incrementing change identifier for ordering'),
    ('history', 'schema_name', 'text', true, 'Name of the schema where the change occurred'),
    ('history', 'record_id', 'uuid', true, 'ID of the record that was changed'),
    ('history', 'operation', 'text', true, 'Operation type: create, update, or delete'),
    ('history', 'changes', 'jsonb', true, 'Field-level changes with old and new values'),
    ('history', 'created_by', 'uuid', false, 'ID of the user who made the change'),
    ('history', 'request_id', 'text', false, 'Request correlation ID for tracing'),
    ('history', 'metadata', 'jsonb', false, 'Additional context (IP address, user agent, etc.)');

-- Column definitions for 'snapshots' schema (excluding system fields)
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('snapshots', 'name', 'varchar(255)', true, 'Snapshot identifier'),
    ('snapshots', 'database', 'varchar(255)', true, 'PostgreSQL database name (format: snapshot_{random})'),
    ('snapshots', 'description', 'text', false, 'Optional description of snapshot purpose'),
    ('snapshots', 'status', 'varchar(20)', true, 'Processing status: pending, processing, active, failed'),
    ('snapshots', 'snapshot_type', 'varchar(20)', true, 'Type: manual, auto, pre_migration, scheduled'),
    ('snapshots', 'size_bytes', 'bigint', false, 'Snapshot database size in bytes'),
    ('snapshots', 'record_count', 'integer', false, 'Total records at snapshot time'),
    ('snapshots', 'error_message', 'text', false, 'Error details if status is failed'),
    ('snapshots', 'created_by', 'uuid', true, 'User who created the snapshot'),
    ('snapshots', 'expires_at', 'timestamp', false, 'Retention policy expiration time');

-- ============================================================================
-- PART 4: UTILITY FUNCTIONS
-- ============================================================================

-- Function to create table from schema definition
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
        SELECT column_name, type, required, default_value, "unique"
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

    -- Create unique indexes for columns marked as unique
    FOR v_column IN
        SELECT column_name
        FROM columns
        WHERE schema_name = p_schema_name
          AND "unique" = true
    LOOP
        EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (%I)',
            p_schema_name || '_' || v_column.column_name || '_unique_idx',
            p_schema_name,
            v_column.column_name);
    END LOOP;

    -- Update schema status to active
    UPDATE schemas SET status = 'active' WHERE schema_name = p_schema_name;

    RETURN format('Table %I created successfully', p_schema_name);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: CREATE HISTORY TABLE
-- ============================================================================

-- Create the history table using the schema definition above
SELECT create_table_from_schema('history');

-- Create composite index for efficient history queries by schema+record
CREATE INDEX idx_history_schema_record ON history(schema_name, record_id, change_id DESC);

-- ============================================================================
-- PART 6: DEFINITIONS SYSTEM (JSON Schema)
-- ============================================================================
-- Based on sql/init-definitions.sql

-- Definitions table to store compiled JSON Schema definitions
-- This table contains the generated JSON Schema built from schemas + columns metadata
CREATE TABLE "definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_id" uuid NOT NULL,
	"schema_name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_checksum" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schemas_id_schema_id_fk"
    FOREIGN KEY ("schema_id") REFERENCES "public"."schemas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schemas_name_schema_name_fk"
    FOREIGN KEY ("schema_name") REFERENCES "public"."schemas"("schema_name")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Add unique constraint and indexes
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schema_name_unique" UNIQUE("schema_name");
CREATE INDEX "idx_definitions_schema_id" ON "definitions" ("schema_id");
CREATE INDEX "idx_definitions_updated_at" ON "definitions" ("updated_at");

-- Add comments to document the table structure
COMMENT ON TABLE "definitions" IS 'Compiled JSON Schema definitions generated from schemas and columns metadata';
COMMENT ON COLUMN "definitions"."id" IS 'UUID primary key for definition record';
COMMENT ON COLUMN "definitions"."schema_id" IS 'Foreign key to schemas.id';
COMMENT ON COLUMN "definitions"."schema_name" IS 'Foreign key to schemas.name';
COMMENT ON COLUMN "definitions"."definition" IS 'Complete JSON Schema definition object compiled from columns metadata';
COMMENT ON COLUMN "definitions"."definition_checksum" IS 'SHA256 checksum of definition for change detection';
COMMENT ON COLUMN "definitions"."created_at" IS 'Timestamp when definition was first created';
COMMENT ON COLUMN "definitions"."updated_at" IS 'Timestamp when definition was last regenerated';

-- Function to regenerate JSON Schema definition from schemas and columns metadata
-- This function builds a complete JSON Schema object from normalized column data
CREATE OR REPLACE FUNCTION regenerate_schema_definition(p_schema_name text)
RETURNS void AS $$
DECLARE
    v_schema_id uuid;
    v_schema_description text;
    v_properties jsonb := '{}'::jsonb;
    v_required text[] := '{}';
    v_definition jsonb;
    v_checksum text;
    v_column record;
    v_property jsonb;
    v_type text;
BEGIN
    -- Fetch schema metadata
    SELECT id INTO v_schema_id
    FROM schemas
    WHERE schema_name = p_schema_name;

    IF v_schema_id IS NULL THEN
        RAISE EXCEPTION 'Schema not found: %', p_schema_name;
    END IF;

    -- Use schema name as description (can be enhanced later with a description column)
    v_schema_description := p_schema_name;

    -- Build properties object from columns
    FOR v_column IN
        SELECT
            column_name, type, required, default_value,
            minimum, maximum, pattern, enum_values, is_array,
            description, relationship_type, related_schema, related_column,
            relationship_name, cascade_delete, required_relationship
        FROM columns
        WHERE schema_name = p_schema_name
        ORDER BY column_name
    LOOP
        -- Start with base type mapping
        v_property := '{}'::jsonb;
        v_type := v_column.type::text;  -- Convert enum to text

        -- Map column type to JSON Schema type
        CASE
            WHEN v_type = 'text' THEN
                v_property := jsonb_build_object('type', 'string');
            WHEN v_type = 'integer' THEN
                v_property := jsonb_build_object('type', 'integer');
            WHEN v_type = 'numeric' THEN
                v_property := jsonb_build_object('type', 'number');
            WHEN v_type = 'boolean' THEN
                v_property := jsonb_build_object('type', 'boolean');
            WHEN v_type = 'jsonb' THEN
                v_property := jsonb_build_object('type', 'object');
            WHEN v_type = 'uuid' THEN
                v_property := jsonb_build_object('type', 'string', 'format', 'uuid');
            WHEN v_type = 'timestamp' THEN
                v_property := jsonb_build_object('type', 'string', 'format', 'date-time');
            WHEN v_type = 'date' THEN
                v_property := jsonb_build_object('type', 'string', 'format', 'date');
            WHEN v_type IN ('text[]', 'integer[]', 'numeric[]', 'uuid[]') THEN
                v_property := jsonb_build_object('type', 'array');
            ELSE
                v_property := jsonb_build_object('type', 'string');
        END CASE;

        -- Add validation constraints
        IF v_column.minimum IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('minimum', v_column.minimum);
        END IF;

        IF v_column.maximum IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('maximum', v_column.maximum);
        END IF;

        IF v_column.pattern IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('pattern', v_column.pattern);
        END IF;

        -- Handle enum values with nullable support (anyOf for Ajv)
        IF v_column.enum_values IS NOT NULL AND array_length(v_column.enum_values, 1) > 0 THEN
            -- Check if column allows NULL (not required)
            IF v_column.required = false THEN
                -- Use anyOf to allow null or enum values for Ajv compatibility
                v_property := jsonb_build_object(
                    'anyOf',
                    jsonb_build_array(
                        jsonb_build_object('type', 'null'),
                        jsonb_build_object('enum', to_jsonb(v_column.enum_values))
                    )
                );
            ELSE
                -- Required field, just use enum
                v_property := v_property || jsonb_build_object('enum', to_jsonb(v_column.enum_values));
            END IF;
        END IF;

        IF v_column.default_value IS NOT NULL THEN
            -- Try to parse default value as JSON, fallback to string
            BEGIN
                v_property := v_property || jsonb_build_object('default', v_column.default_value::jsonb);
            EXCEPTION WHEN OTHERS THEN
                v_property := v_property || jsonb_build_object('default', v_column.default_value);
            END;
        END IF;

        IF v_column.description IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('description', v_column.description);
        END IF;

        -- Add x-monk-relationship extension if relationship exists
        IF v_column.relationship_type IS NOT NULL THEN
            v_property := v_property || jsonb_build_object(
                'x-monk-relationship',
                jsonb_build_object(
                    'type', v_column.relationship_type,
                    'schema', v_column.related_schema,
                    'column', v_column.related_column,
                    'name', v_column.relationship_name,
                    'cascadeDelete', COALESCE(v_column.cascade_delete, false),
                    'required', COALESCE(v_column.required_relationship, false)
                )
            );
        END IF;

        -- Add property to properties object
        v_properties := v_properties || jsonb_build_object(v_column.column_name, v_property);

        -- Track required fields
        IF v_column.required = true THEN
            v_required := array_append(v_required, v_column.column_name);
        END IF;
    END LOOP;

    -- Build complete JSON Schema definition
    v_definition := jsonb_build_object(
        'type', 'object',
        'title', p_schema_name,
        'description', v_schema_description,
        'properties', v_properties,
        'required', to_jsonb(v_required),
        'additionalProperties', false
    );

    -- Calculate checksum for change detection
    v_checksum := encode(digest(v_definition::text, 'sha256'), 'hex');

    -- Upsert into definitions table
    INSERT INTO definitions (schema_id, schema_name, definition, definition_checksum, created_at, updated_at)
    VALUES (v_schema_id, p_schema_name, v_definition, v_checksum, now(), now())
    ON CONFLICT (schema_name)
    DO UPDATE SET
        definition = EXCLUDED.definition,
        definition_checksum = EXCLUDED.definition_checksum,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION regenerate_schema_definition(text) IS 'Regenerates JSON Schema definition from schemas and columns metadata for the specified schema';

-- Trigger function to automatically regenerate definitions when columns change
-- This function handles INSERT, UPDATE, and DELETE operations on the columns table
-- Uses row-level trigger since PostgreSQL doesn't support REFERENCING with multiple events
CREATE OR REPLACE FUNCTION trigger_regenerate_schema_definitions()
RETURNS TRIGGER AS $$
BEGIN
    -- Regenerate definition for the affected schema
    IF TG_OP = 'DELETE' THEN
        PERFORM regenerate_schema_definition(OLD.schema_name);
    ELSE
        PERFORM regenerate_schema_definition(NEW.schema_name);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Row-level trigger on columns table
-- Fires for each row change to regenerate the affected schema's definition
CREATE TRIGGER trigger_columns_regenerate_definitions
AFTER INSERT OR UPDATE OR DELETE ON columns
FOR EACH ROW
EXECUTE FUNCTION trigger_regenerate_schema_definitions();

COMMENT ON FUNCTION trigger_regenerate_schema_definitions() IS 'Trigger function to automatically regenerate schema definitions when columns are modified';

-- Insert definition for schemas schema
INSERT INTO "definitions" (schema_id, schema_name, definition, definition_checksum)
SELECT
    s.id,
    'schemas',
    '{
        "type": "object",
        "title": "Schemas",
        "description": "Schema registry table for describe API schema definitions",
        "properties": {
            "schema_name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100,
                "description": "Unique schema name",
                "example": "accounts"
            },
            "status": {
                "type": "string",
                "enum": ["pending", "active", "disabled", "system"],
                "default": "pending",
                "description": "Schema status"
            }
        },
        "required": ["schema_name", "status"],
        "additionalProperties": false
    }'::jsonb,
    encode(digest('{
        "type": "object",
        "title": "Schemas",
        "description": "Schema registry table for describe API schema definitions",
        "properties": {
            "schema_name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100,
                "description": "Unique schema name",
                "example": "accounts"
            },
            "status": {
                "type": "string",
                "enum": ["pending", "active", "disabled", "system"],
                "default": "pending",
                "description": "Schema status"
            }
        },
        "required": ["schema_name", "status"],
        "additionalProperties": false
    }'::text, 'sha256'), 'hex')
FROM schemas s WHERE s.schema_name = 'schemas';

-- Insert definition for users schema
INSERT INTO "definitions" (schema_id, schema_name, definition, definition_checksum)
SELECT
    s.id,
    'users',
    '{
        "type": "object",
        "title": "Users",
        "description": "User management schema for tenant databases",
        "properties": {
            "name": {
                "type": "string",
                "minLength": 2,
                "maxLength": 100,
                "description": "Human-readable display name for the user",
                "example": "Jane Smith"
            },
            "auth": {
                "type": "string",
                "minLength": 2,
                "maxLength": 255,
                "description": "Authentication identifier (username, email, etc.)",
                "example": "jane@company.com"
            },
            "access": {
                "type": "string",
                "enum": ["root", "full", "edit", "read", "deny"],
                "description": "Access level for the user",
                "example": "full"
            }
        },
        "required": ["id", "name", "auth", "access"],
        "additionalProperties": false
    }'::jsonb,
    encode(digest('{
        "type": "object",
        "title": "Users",
        "description": "User management schema for tenant databases",
        "properties": {
            "name": {
                "type": "string",
                "minLength": 2,
                "maxLength": 100,
                "description": "Human-readable display name for the user",
                "example": "Jane Smith"
            },
            "auth": {
                "type": "string",
                "minLength": 2,
                "maxLength": 255,
                "description": "Authentication identifier (username, email, etc.)",
                "example": "jane@company.com"
            },
            "access": {
                "type": "string",
                "enum": ["root", "full", "edit", "read", "deny"],
                "description": "Access level for the user",
                "example": "full"
            }
        },
        "required": ["id", "name", "auth", "access"],
        "additionalProperties": false
    }'::text, 'sha256'), 'hex')
FROM schemas s WHERE s.schema_name = 'users';

-- Register definitions schema as a system schema requiring sudo access
-- This prevents modification of the auto-generated definitions table
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES (
    'definitions',
    'system',
    true
)
ON CONFLICT (schema_name) DO NOTHING;

-- ============================================================================
-- PART 7: DEFAULT USERS
-- ============================================================================
-- Based on fixtures/empty/init.sql

-- Insert core users for testing and development
-- These users are required by many tests that authenticate with specific access levels
INSERT INTO users (name, auth, access) VALUES
    ('root', 'root', 'root'),
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Default template includes pre-configured root user for initial login';

-- ============================================================================
-- PART 8: REGISTER TEMPLATE IN MONK DATABASE
-- ============================================================================
-- This registers the newly created template in the central monk registry

DO $$
BEGIN
    -- Connect to monk database and register this template
    -- Note: This uses dblink to register in the monk database from within this template
    -- The autoinstall script should handle this registration instead
    RAISE NOTICE 'Template database monk_template_default initialized successfully';
    RAISE NOTICE 'This template should now be registered in the monk.templates table';
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
    schema_count INTEGER;
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO schema_count FROM "schemas";
    SELECT COUNT(*) INTO user_count FROM "users";

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Default Template Initialization Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Database: monk_template_default';
    RAISE NOTICE 'Schemas:  %', schema_count;
    RAISE NOTICE 'Users:    %', user_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Ready to be used as template for new tenants';
    RAISE NOTICE '';
END $$;

-- Compiled Fixture: system
-- Generated: 2025-11-25T23:20:54.159Z
-- Parameters: :database, :schema
--
-- Usage:
--   Replace :database and :schema placeholders before execution
--   Example: sed 's/:database/db_main/g; s/:schema/ns_tenant_abc123/g' deploy.sql | psql

BEGIN;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS :schema;

-- Set search path to target schema
SET search_path TO :schema, public;

-- ============================================================================
-- Monk API - System Fixture Loader
-- ============================================================================
-- Core system fixture with essential infrastructure models
--
-- Dependencies: none
-- Models: models, fields, users
--
-- Usage:
--   createdb monk_template_system
--   psql -d monk_template_system -f fixtures/system/load.sql

-- ECHO: '========================================'
-- ECHO: 'Loading System Fixture'
-- ECHO: '========================================'

-- PHASE 1: INITIALIZATION
-- ECHO: ''
-- ECHO: 'Phase 1: Initialization (extensions, types)'

-- Enable pgcrypto extension for checksum generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum type for field data types
CREATE TYPE field_type AS ENUM (
    'text',
    'integer',
    'bigint',
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

-- PHASE 2: TABLE DEFINITIONS (DDL)
-- ECHO: ''
-- ECHO: 'Phase 2: Table Definitions'
-- BEGIN: describe/models.sql
-- ============================================================================
-- MODEL: models
-- ============================================================================
-- Model registry table to store model metadata

CREATE TABLE "models" (
    -- System fields
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,

	-- Model metadata
	"model_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text,
	"sudo" boolean DEFAULT false NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"immutable" boolean DEFAULT false NOT NULL,
	"external" boolean DEFAULT false NOT NULL,

	-- Constraints
	CONSTRAINT "model_name_unique" UNIQUE("model_name")
);

-- END: describe/models.sql
-- BEGIN: describe/fields.sql
-- ============================================================================
-- MODEL: fields
-- ============================================================================
-- Field registry table to store individual field metadata

CREATE TABLE "fields" (
    -- System fields
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,

	-- Field metadata
	"model_name" text NOT NULL,
	"field_name" text NOT NULL,
	"type" field_type NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"description" text,

	-- Relationships
	"relationship_type" text,
	"related_model" text,
	"related_field" text,
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

-- Foreign key: fields belong to models
ALTER TABLE "fields" ADD CONSTRAINT "fields_models_name_model_name_fk"
    FOREIGN KEY ("model_name") REFERENCES "models"("model_name")
    ON DELETE no action ON UPDATE no action;

-- Unique index for model+field combination
CREATE UNIQUE INDEX "idx_fields_model_field"
    ON "fields" ("model_name", "field_name");

-- END: describe/fields.sql
-- BEGIN: describe/users.sql
-- ============================================================================
-- MODEL: users
-- ============================================================================
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

-- END: describe/users.sql

-- PHASE 3: DATA (DML)
-- ECHO: ''
-- ECHO: 'Phase 3: Data Inserts'
-- BEGIN: data/models.sql
-- ============================================================================
-- DATA: Models model registration
-- ============================================================================
-- Register the models table itself in the models registry
-- This enables recursive model discovery via the Data API

INSERT INTO "models" (model_name, status, sudo)
VALUES ('models', 'system', true);

-- ============================================================================
-- FIELDS FOR: models
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, default_value, description) VALUES
    ('models', 'model_name', 'text', true, NULL, 'Unique name for the model'),
    ('models', 'status', 'text', false, 'active', 'Model status (active, disabled, system)'),
    ('models', 'description', 'text', false, NULL, 'Human-readable description of the model'),
    ('models', 'sudo', 'boolean', false, NULL, 'Whether model modifications require sudo access'),
    ('models', 'frozen', 'boolean', false, NULL, 'Whether all data changes are prevented on this model'),
    ('models', 'immutable', 'boolean', false, NULL, 'Whether records are write-once (can be created but never modified)'),
    ('models', 'external', 'boolean', false, NULL, 'Whether model is managed externally (skip DDL operations)');

-- END: data/models.sql
-- BEGIN: data/fields.sql
-- ============================================================================
-- DATA: Fields model registration and field definitions
-- ============================================================================
-- Register the fields table and define metadata for all system models

-- Register fields model
INSERT INTO "models" (model_name, status, sudo)
VALUES ('fields', 'system', true);

-- ============================================================================
-- FIELDS FOR: fields
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('fields', 'model_name', 'text', true, 'Name of the model this field belongs to'),
    ('fields', 'field_name', 'text', true, 'Name of the field'),
    ('fields', 'type', 'text', true, 'Data type of the field'),
    ('fields', 'required', 'boolean', false, 'Whether the field is required (NOT NULL)'),
    ('fields', 'default_value', 'text', false, 'Default value for the field'),
    ('fields', 'description', 'text', false, 'Human-readable description of the field'),
    ('fields', 'relationship_type', 'text', false, 'Type of relationship (owned, referenced)'),
    ('fields', 'related_model', 'text', false, 'Related model for relationships'),
    ('fields', 'related_field', 'text', false, 'Related field for relationships'),
    ('fields', 'relationship_name', 'text', false, 'Name of the relationship'),
    ('fields', 'cascade_delete', 'boolean', false, 'Whether to cascade delete on relationship'),
    ('fields', 'required_relationship', 'boolean', false, 'Whether the relationship is required'),
    ('fields', 'minimum', 'numeric', false, 'Minimum value constraint for numeric fields'),
    ('fields', 'maximum', 'numeric', false, 'Maximum value constraint for numeric fields'),
    ('fields', 'pattern', 'text', false, 'Regular expression pattern for validation'),
    ('fields', 'enum_values', 'text[]', false, 'Allowed enum values'),
    ('fields', 'is_array', 'boolean', false, 'Whether the field is an array type'),
    ('fields', 'immutable', 'boolean', false, 'Whether the field value cannot be changed once set'),
    ('fields', 'sudo', 'boolean', false, 'Whether modifying this field requires sudo access'),
    ('fields', 'unique', 'boolean', false, 'Whether the field must have unique values'),
    ('fields', 'index', 'boolean', false, 'Whether to create a standard btree index on this field'),
    ('fields', 'tracked', 'boolean', false, 'Whether changes to this field are tracked in history'),
    ('fields', 'searchable', 'boolean', false, 'Whether to enable full-text search with GIN index'),
    ('fields', 'transform', 'text', false, 'Auto-transform values: lowercase, uppercase, trim, normalize_phone, normalize_email');

-- END: data/fields.sql
-- BEGIN: data/users.sql
-- ============================================================================
-- DATA: Users model registration and default users
-- ============================================================================

-- Register users model
INSERT INTO "models" (model_name, status, sudo)
VALUES ('users', 'system', true);

-- ============================================================================
-- FIELDS FOR: users
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('users', 'name', 'text', true, 'User display name'),
    ('users', 'auth', 'text', true, 'Authentication identifier'),
    ('users', 'access', 'text', true, 'User access level (root, full, edit, read, deny)');

-- Insert default root user for initial access
INSERT INTO users (name, auth, access) VALUES
    ('root', 'root', 'root')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Default template includes pre-configured root user for initial login';

-- END: data/users.sql

-- SUMMARY
-- ECHO: ''
-- ECHO: '========================================'
-- ECHO: 'System Fixture Loaded Successfully'
-- ECHO: '========================================'

DO $$
DECLARE
    model_count INTEGER;
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO model_count FROM "models";
    SELECT COUNT(*) INTO user_count FROM "users";

    RAISE NOTICE '';
    RAISE NOTICE 'Database: %', current_database();
    RAISE NOTICE 'Models:   %', model_count;
    RAISE NOTICE 'Users:    %', user_count;
    RAISE NOTICE '';
END $$;

COMMIT;

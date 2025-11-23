-- Compiled Fixture: system
-- Generated: 2025-11-23T15:32:30.391Z
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
-- This script loads the system fixture in the correct order
--
-- Usage:
--   createdb monk_template_system
--   psql -d monk_template_system -f fixtures/system/load.sql
--
-- Or programmatically via a loader script

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
-- BEGIN: describe/snapshots.sql
-- ============================================================================
-- MODEL: snapshots
-- ============================================================================
-- Snapshots table for point-in-time full database backups (pg_dump based)

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

-- Indexes for efficient querying
CREATE INDEX "idx_snapshots_status" ON "snapshots" ("status");
CREATE INDEX "idx_snapshots_type" ON "snapshots" ("snapshot_type");
CREATE INDEX "idx_snapshots_created_by" ON "snapshots" ("created_by");
CREATE INDEX "idx_snapshots_created_at" ON "snapshots" ("created_at");
CREATE INDEX "idx_snapshots_expires" ON "snapshots" ("expires_at") WHERE "expires_at" IS NOT NULL;
CREATE INDEX "idx_snapshots_trashed" ON "snapshots" ("trashed_at") WHERE "trashed_at" IS NOT NULL;

-- END: describe/snapshots.sql
-- BEGIN: describe/extracts.sql
-- ============================================================================
-- MODEL: extracts
-- ============================================================================
-- Data extraction job configurations

CREATE TABLE "extracts" (
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

	-- Extract configuration
	"name" text NOT NULL,
	"description" text,
	"format" text DEFAULT 'jsonl' NOT NULL CHECK ("format" IN ('yaml', 'json', 'jsonl', 'archive')),
	"include" text[] DEFAULT ARRAY['describe', 'data']::text[],
	"models" text[],
	"filter" jsonb,
	"compress" boolean DEFAULT true,
	"split_files" boolean DEFAULT false,

	-- Scheduling
	"schedule" text,
	"schedule_enabled" boolean DEFAULT false,
	"retention_days" integer DEFAULT 7,
	"enabled" boolean DEFAULT true,

	-- Stats (denormalized)
	"last_run_id" uuid,
	"last_run_status" text,
	"last_run_at" timestamp,
	"total_runs" integer DEFAULT 0,
	"successful_runs" integer DEFAULT 0,
	"failed_runs" integer DEFAULT 0
);

CREATE INDEX "idx_extracts_enabled" ON "extracts" ("enabled");
CREATE INDEX "idx_extracts_schedule_enabled" ON "extracts" ("schedule_enabled") WHERE "schedule_enabled" = true;

-- END: describe/extracts.sql
-- BEGIN: describe/extract_runs.sql
-- ============================================================================
-- MODEL: extract_runs
-- ============================================================================
-- Individual execution runs of extract jobs

CREATE TABLE "extract_runs" (
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

	-- Relationship
	"extract_id" uuid NOT NULL,
	"extract_name" text,

	-- Execution state
	"status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
	"progress" integer DEFAULT 0 CHECK ("progress" BETWEEN 0 AND 100),
	"progress_detail" jsonb,

	-- Timing
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_seconds" integer,

	-- Results
	"records_exported" integer DEFAULT 0,
	"models_exported" integer DEFAULT 0,
	"artifacts_created" integer DEFAULT 0,
	"total_size_bytes" bigint DEFAULT 0,

	-- Error handling
	"error" text,
	"error_detail" jsonb,

	-- Execution context
	"executed_by" uuid,
	"triggered_by" text DEFAULT 'manual' CHECK ("triggered_by" IN ('manual', 'schedule', 'api')),
	"config_snapshot" jsonb
);

-- Foreign key
ALTER TABLE "extract_runs" ADD CONSTRAINT "extract_runs_extract_id_fk"
    FOREIGN KEY ("extract_id") REFERENCES "extracts"("id")
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_extract_runs_extract_id" ON "extract_runs" ("extract_id");
CREATE INDEX "idx_extract_runs_status" ON "extract_runs" ("status");
CREATE INDEX "idx_extract_runs_created_at" ON "extract_runs" ("created_at" DESC);

-- END: describe/extract_runs.sql
-- BEGIN: describe/extract_artifacts.sql
-- ============================================================================
-- MODEL: extract_artifacts
-- ============================================================================
-- Individual downloadable files generated by extract runs

CREATE TABLE "extract_artifacts" (
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

	-- Relationships
	"run_id" uuid NOT NULL,
	"extract_id" uuid NOT NULL,

	-- Artifact identity
	"artifact_type" text NOT NULL,
	"artifact_name" text NOT NULL,

	-- Storage
	"storage_path" text NOT NULL,
	"storage_backend" text DEFAULT 'local' CHECK ("storage_backend" IN ('local', 's3', 'gcs', 'azure')),
	"download_url" text,

	-- Metadata
	"format" text,
	"size_bytes" bigint NOT NULL,
	"checksum" text,
	"content_type" text DEFAULT 'application/octet-stream',

	-- Lifecycle
	"expires_at" timestamp,
	"accessed_at" timestamp,
	"download_count" integer DEFAULT 0,

	-- Flags
	"is_primary" boolean DEFAULT false
);

-- Foreign keys
ALTER TABLE "extract_artifacts" ADD CONSTRAINT "extract_artifacts_run_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "extract_runs"("id")
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_extract_artifacts_run_id" ON "extract_artifacts" ("run_id");
CREATE INDEX "idx_extract_artifacts_extract_id" ON "extract_artifacts" ("extract_id");
CREATE INDEX "idx_extract_artifacts_expires_at" ON "extract_artifacts" ("expires_at") WHERE "expires_at" IS NOT NULL;

-- END: describe/extract_artifacts.sql
-- BEGIN: describe/restores.sql
-- Restore Configuration Table
-- Defines restore/import jobs with source and conflict resolution strategies

CREATE TABLE "restores" (
    -- System fields
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "access_public" boolean DEFAULT false NOT NULL,
    "access_tenants" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "access_users" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" uuid,
    "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" uuid,
    "deleted_at" timestamp,
    "deleted_by" uuid,

    -- Configuration
    "name" text NOT NULL,
    "description" text,
    "source_type" text DEFAULT 'upload' NOT NULL,
    "source_ref" text,
    "conflict_strategy" text DEFAULT 'upsert' NOT NULL,
    "include" text[] DEFAULT ARRAY['describe', 'data']::text[] NOT NULL,
    "models" text[],
    "create_models" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,

    -- Statistics
    "last_run_id" uuid,
    "last_run_at" timestamp,
    "total_runs" integer DEFAULT 0 NOT NULL,
    "successful_runs" integer DEFAULT 0 NOT NULL,
    "failed_runs" integer DEFAULT 0 NOT NULL,

    CONSTRAINT "restores_source_type_check" CHECK (source_type IN ('upload', 'extract_run', 'url')),
    CONSTRAINT "restores_conflict_strategy_check" CHECK (conflict_strategy IN ('replace', 'upsert', 'merge', 'sync', 'skip', 'error'))
);

-- Indexes
CREATE INDEX "restores_enabled_idx" ON "restores"("enabled");
CREATE INDEX "restores_source_type_idx" ON "restores"("source_type");
CREATE INDEX "restores_last_run_at_idx" ON "restores"("last_run_at");

-- END: describe/restores.sql
-- BEGIN: describe/restore_runs.sql
-- Restore Run Execution Tracking
-- Tracks individual restore job executions with progress and results

CREATE TABLE "restore_runs" (
    -- System fields
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "access_public" boolean DEFAULT false NOT NULL,
    "access_tenants" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "access_users" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" uuid,
    "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" uuid,
    "deleted_at" timestamp,
    "deleted_by" uuid,

    -- Restore reference
    "restore_id" uuid,
    "restore_name" text,
    "source_filename" text,

    -- Execution status
    "status" text DEFAULT 'pending' NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "progress_detail" jsonb,
    "started_at" timestamp,
    "completed_at" timestamp,
    "duration_seconds" integer,

    -- Results
    "records_imported" integer DEFAULT 0 NOT NULL,
    "records_skipped" integer DEFAULT 0 NOT NULL,
    "records_updated" integer DEFAULT 0 NOT NULL,
    "models_created" integer DEFAULT 0 NOT NULL,
    "fields_created" integer DEFAULT 0 NOT NULL,

    -- Error tracking
    "error" text,
    "error_detail" text,

    -- Configuration snapshot
    "config_snapshot" jsonb,

    CONSTRAINT "restore_runs_status_check" CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT "restore_runs_progress_check" CHECK (progress >= 0 AND progress <= 100)
);

-- Indexes
CREATE INDEX "restore_runs_restore_id_idx" ON "restore_runs"("restore_id");
CREATE INDEX "restore_runs_status_idx" ON "restore_runs"("status");
CREATE INDEX "restore_runs_created_at_idx" ON "restore_runs"("created_at");
CREATE INDEX "restore_runs_started_at_idx" ON "restore_runs"("started_at");

-- END: describe/restore_runs.sql
-- BEGIN: describe/restore_logs.sql
-- Restore Log Entries
-- Detailed logging for restore operations (info, warnings, errors)

CREATE TABLE "restore_logs" (
    -- System fields
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "access_public" boolean DEFAULT false NOT NULL,
    "access_tenants" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "access_users" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" uuid,
    "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" uuid,
    "deleted_at" timestamp,
    "deleted_by" uuid,

    -- Log entry
    "run_id" uuid NOT NULL,
    "level" text NOT NULL,
    "phase" text,
    "model_name" text,
    "record_id" text,
    "message" text NOT NULL,
    "detail" jsonb,

    CONSTRAINT "restore_logs_level_check" CHECK (level IN ('info', 'warn', 'error')),
    CONSTRAINT "restore_logs_phase_check" CHECK (phase IS NULL OR phase IN ('upload', 'validation', 'describe_import', 'data_import'))
);

-- Indexes
CREATE INDEX "restore_logs_run_id_idx" ON "restore_logs"("run_id");
CREATE INDEX "restore_logs_level_idx" ON "restore_logs"("level");
CREATE INDEX "restore_logs_created_at_idx" ON "restore_logs"("created_at");
CREATE INDEX "restore_logs_model_name_idx" ON "restore_logs"("model_name");

-- END: describe/restore_logs.sql
-- BEGIN: describe/grids.sql
-- ============================================================================
-- MODEL: grids
-- ============================================================================
-- Grid metadata storage - regular model managed via Data API

CREATE TABLE "grids" (
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

	-- Grid metadata
	"name" text NOT NULL,
	"description" text,
	"row_count" integer,
	"row_max" integer DEFAULT 1000,
	"col_max" text DEFAULT 'Z'
);

-- END: describe/grids.sql
-- BEGIN: describe/grid_cells.sql
-- ============================================================================
-- MODEL: grid_cells (EXTERNAL)
-- ============================================================================
-- Grid cell storage - external model managed by Grid API
-- Model definition lives in system, but data is accessed via /api/grids/* only

CREATE TABLE grid_cells (
	grid_id UUID NOT NULL,
	row INTEGER NOT NULL,
	col CHAR(1) NOT NULL,
	value TEXT,

	PRIMARY KEY (grid_id, row, col),
	FOREIGN KEY (grid_id) REFERENCES grids(id) ON DELETE CASCADE
);

CREATE INDEX idx_grid_range ON grid_cells(grid_id, row, col);

COMMENT ON TABLE grid_cells IS 'Grid cell storage for Grid API (external model - see /api/grids/*)';

-- END: describe/grid_cells.sql
-- BEGIN: describe/history.sql
-- ============================================================================
-- MODEL: history
-- ============================================================================
-- Change tracking and audit trail table

CREATE TABLE "history" (
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

	-- History-specific fields
	"change_id" bigserial NOT NULL,
	"model_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"changes" jsonb NOT NULL,
	"created_by" uuid,
	"request_id" text,
	"metadata" jsonb
);

-- Composite index for efficient history queries
CREATE INDEX idx_history_model_record ON history(model_name, record_id, change_id DESC);

-- END: describe/history.sql

-- PHASE 3: FUNCTIONS
-- ECHO: ''
-- ECHO: 'Phase 3: Functions & Triggers'
-- No functions needed

-- PHASE 4: DATA (DML)
-- ECHO: ''
-- ECHO: 'Phase 4: Data Inserts'
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
-- BEGIN: data/history.sql
-- ============================================================================
-- DATA: History model registration
-- ============================================================================

-- Register history model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'history',
    'system',
    true,
    'Change tracking and audit trail'
);

-- ============================================================================
-- FIELDS FOR: history
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('history', 'change_id', 'bigserial', true, 'Auto-incrementing change identifier for ordering'),
    ('history', 'model_name', 'text', true, 'Name of the model where the change occurred'),
    ('history', 'record_id', 'uuid', true, 'ID of the record that was changed'),
    ('history', 'operation', 'text', true, 'Operation type: create, update, or delete'),
    ('history', 'changes', 'jsonb', true, 'Field-level changes with old and new values'),
    ('history', 'created_by', 'uuid', false, 'ID of the user who made the change'),
    ('history', 'request_id', 'text', false, 'Request correlation ID for tracing'),
    ('history', 'metadata', 'jsonb', false, 'Additional context (IP address, user agent, etc.)');

-- END: data/history.sql
-- BEGIN: data/extracts.sql
-- ============================================================================
-- DATA: Register extract models and define fields
-- ============================================================================

-- Register extracts model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'extracts',
    'system',
    false,
    'Data extraction job configurations'
);

-- Register extract_runs model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'extract_runs',
    'system',
    false,
    'Individual execution runs of extract jobs'
);

-- Register extract_artifacts model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'extract_artifacts',
    'system',
    false,
    'Downloadable files generated by extract runs'
);

-- ============================================================================
-- FIELDS FOR: extracts
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('extracts', 'name', 'text', true, 'Human-readable name for this extract'),
    ('extracts', 'description', 'text', false, 'Purpose and notes'),
    ('extracts', 'format', 'text', false, 'Output format: yaml, json, jsonl, archive'),
    ('extracts', 'include', 'text[]', false, 'What to include: describe, data, acls, files'),
    ('extracts', 'models', 'text[]', false, 'Specific models to extract (null = all)'),
    ('extracts', 'filter', 'jsonb', false, 'Optional filter to apply per model'),
    ('extracts', 'compress', 'boolean', false, 'Gzip the output'),
    ('extracts', 'split_files', 'boolean', false, 'Create separate file per model'),
    ('extracts', 'schedule', 'text', false, 'Cron expression'),
    ('extracts', 'schedule_enabled', 'boolean', false, 'Enable scheduled execution'),
    ('extracts', 'retention_days', 'integer', false, 'How long to keep artifacts'),
    ('extracts', 'enabled', 'boolean', false, 'Can this extract be executed'),
    ('extracts', 'last_run_id', 'uuid', false, 'Most recent execution'),
    ('extracts', 'last_run_status', 'text', false, 'Status of last run'),
    ('extracts', 'last_run_at', 'timestamp', false, 'When last executed'),
    ('extracts', 'total_runs', 'integer', false, 'Total execution count'),
    ('extracts', 'successful_runs', 'integer', false, 'Successful execution count'),
    ('extracts', 'failed_runs', 'integer', false, 'Failed execution count');

-- ============================================================================
-- FIELDS FOR: extract_runs
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('extract_runs', 'extract_id', 'uuid', true, 'Foreign key to extracts table'),
    ('extract_runs', 'extract_name', 'text', false, 'Denormalized for easier queries'),
    ('extract_runs', 'status', 'text', true, 'Execution status: pending, queued, running, completed, failed, cancelled'),
    ('extract_runs', 'progress', 'integer', false, 'Completion percentage (0-100)'),
    ('extract_runs', 'progress_detail', 'jsonb', false, 'Detailed progress information'),
    ('extract_runs', 'started_at', 'timestamp', false, 'When execution began'),
    ('extract_runs', 'completed_at', 'timestamp', false, 'When execution finished'),
    ('extract_runs', 'duration_seconds', 'integer', false, 'Execution time in seconds'),
    ('extract_runs', 'records_exported', 'integer', false, 'Total records exported'),
    ('extract_runs', 'models_exported', 'integer', false, 'Number of models exported'),
    ('extract_runs', 'artifacts_created', 'integer', false, 'Number of artifacts generated'),
    ('extract_runs', 'total_size_bytes', 'bigint', false, 'Total size of all artifacts'),
    ('extract_runs', 'error', 'text', false, 'Error message if failed'),
    ('extract_runs', 'error_detail', 'jsonb', false, 'Detailed error context'),
    ('extract_runs', 'executed_by', 'uuid', false, 'User who triggered execution'),
    ('extract_runs', 'triggered_by', 'text', false, 'How it was triggered: manual, schedule, api'),
    ('extract_runs', 'config_snapshot', 'jsonb', false, 'Copy of extract config at execution time');

-- ============================================================================
-- FIELDS FOR: extract_artifacts
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('extract_artifacts', 'run_id', 'uuid', true, 'Foreign key to extract_runs table'),
    ('extract_artifacts', 'extract_id', 'uuid', true, 'Denormalized for cleanup queries'),
    ('extract_artifacts', 'artifact_type', 'text', true, 'Type: describe, data-{model}, manifest'),
    ('extract_artifacts', 'artifact_name', 'text', true, 'Filename'),
    ('extract_artifacts', 'storage_path', 'text', true, 'Local path or cloud key'),
    ('extract_artifacts', 'storage_backend', 'text', false, 'Storage backend: local, s3, gcs, azure'),
    ('extract_artifacts', 'download_url', 'text', false, 'Public or signed URL for download'),
    ('extract_artifacts', 'format', 'text', false, 'File format: jsonl, yaml, json, tar.gz'),
    ('extract_artifacts', 'size_bytes', 'bigint', true, 'File size in bytes'),
    ('extract_artifacts', 'checksum', 'text', false, 'SHA256 hash for integrity'),
    ('extract_artifacts', 'content_type', 'text', false, 'MIME type'),
    ('extract_artifacts', 'expires_at', 'timestamp', false, 'When this artifact will be deleted'),
    ('extract_artifacts', 'accessed_at', 'timestamp', false, 'Last download time'),
    ('extract_artifacts', 'download_count', 'integer', false, 'Number of downloads'),
    ('extract_artifacts', 'is_primary', 'boolean', false, 'Primary downloadable artifact');

-- END: data/extracts.sql
-- BEGIN: data/restores.sql
-- ============================================================================
-- DATA: Register restore models and define fields
-- ============================================================================

-- Register restores model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'restores',
    'system',
    false,
    'Data restoration and import job configurations'
);

-- Register restore_runs model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'restore_runs',
    'system',
    false,
    'Individual execution runs of restore jobs'
);

-- Register restore_logs model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'restore_logs',
    'system',
    false,
    'Detailed logs from restore operations'
);

-- ============================================================================
-- FIELDS FOR: restores
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('restores', 'name', 'text', true, 'Human-readable name for this restore'),
    ('restores', 'description', 'text', false, 'Purpose and notes'),
    ('restores', 'source_type', 'text', true, 'Source type: upload, extract_run, url'),
    ('restores', 'source_ref', 'text', false, 'Reference to source (file path, run ID, or URL)'),
    ('restores', 'conflict_strategy', 'text', true, 'How to handle conflicts: replace, upsert, merge, sync, skip, error'),
    ('restores', 'include', 'text[]', false, 'What to restore: describe, data'),
    ('restores', 'models', 'text[]', false, 'Specific models to restore (null = all)'),
    ('restores', 'create_models', 'boolean', false, 'Allow creating new models'),
    ('restores', 'enabled', 'boolean', false, 'Can this restore be executed'),
    ('restores', 'last_run_id', 'uuid', false, 'Most recent execution'),
    ('restores', 'last_run_at', 'timestamp', false, 'When last executed'),
    ('restores', 'total_runs', 'integer', false, 'Total execution count'),
    ('restores', 'successful_runs', 'integer', false, 'Successful execution count'),
    ('restores', 'failed_runs', 'integer', false, 'Failed execution count');

-- ============================================================================
-- FIELDS FOR: restore_runs
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('restore_runs', 'restore_id', 'uuid', false, 'Foreign key to restores table (null for direct imports)'),
    ('restore_runs', 'restore_name', 'text', false, 'Denormalized for easier queries'),
    ('restore_runs', 'source_filename', 'text', false, 'Original filename of uploaded file'),
    ('restore_runs', 'status', 'text', true, 'Execution status: pending, queued, running, completed, failed, cancelled'),
    ('restore_runs', 'progress', 'integer', false, 'Completion percentage (0-100)'),
    ('restore_runs', 'progress_detail', 'jsonb', false, 'Detailed progress information'),
    ('restore_runs', 'started_at', 'timestamp', false, 'When execution began'),
    ('restore_runs', 'completed_at', 'timestamp', false, 'When execution finished'),
    ('restore_runs', 'duration_seconds', 'integer', false, 'Execution time in seconds'),
    ('restore_runs', 'records_imported', 'integer', false, 'Total records imported'),
    ('restore_runs', 'records_skipped', 'integer', false, 'Total records skipped'),
    ('restore_runs', 'records_updated', 'integer', false, 'Total records updated'),
    ('restore_runs', 'models_created', 'integer', false, 'Number of models created'),
    ('restore_runs', 'fields_created', 'integer', false, 'Number of fields created'),
    ('restore_runs', 'error', 'text', false, 'Error message if failed'),
    ('restore_runs', 'error_detail', 'text', false, 'Detailed error context'),
    ('restore_runs', 'config_snapshot', 'jsonb', false, 'Copy of restore config at execution time');

-- ============================================================================
-- FIELDS FOR: restore_logs
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('restore_logs', 'run_id', 'uuid', true, 'Foreign key to restore_runs table'),
    ('restore_logs', 'level', 'text', true, 'Log level: info, warn, error'),
    ('restore_logs', 'phase', 'text', false, 'Execution phase: upload, validation, describe_import, data_import'),
    ('restore_logs', 'model_name', 'text', false, 'Model being processed'),
    ('restore_logs', 'record_id', 'text', false, 'Record being processed'),
    ('restore_logs', 'message', 'text', true, 'Log message'),
    ('restore_logs', 'detail', 'jsonb', false, 'Additional context');

-- END: data/restores.sql
-- BEGIN: data/grids.sql
-- ============================================================================
-- DATA: Register grids model and define fields
-- ============================================================================

-- Register grids model
INSERT INTO "models" (model_name, status, external, description)
VALUES (
    'grids',
    'system',
    false,
    'Grid metadata storage for Grid API'
);

-- ============================================================================
-- FIELDS FOR: grids
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, default_value, description) VALUES
    ('grids', 'name', 'text', true, NULL, 'Human-readable name for this grid'),
    ('grids', 'description', 'text', false, NULL, 'Purpose and notes'),
    ('grids', 'row_count', 'integer', false, NULL, 'Current number of rows with data'),
    ('grids', 'row_max', 'integer', false, 1000, 'Maximum number of rows allowed'),
    ('grids', 'col_max', 'text', false, 'Z', 'Maximum field letter allowed');

-- END: data/grids.sql
-- BEGIN: data/grid_cells.sql
-- ============================================================================
-- DATA: Register grid_cells model and define fields
-- ============================================================================

-- Register grid_cells model (external - managed by Grid API)
INSERT INTO "models" (model_name, status, external, description)
VALUES (
    'grid_cells',
    'system',
    true,
    'Grid cell storage - external model managed by Grid API'
);

-- ============================================================================
-- FIELDS FOR: grid_cells
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('grid_cells', 'grid_id', 'uuid', true, 'Foreign key to grids table'),
    ('grid_cells', 'row', 'integer', true, 'Row number (1-based)'),
    ('grid_cells', 'col', 'text', true, 'Field letter (A-Z)'),
    ('grid_cells', 'value', 'text', false, 'Cell value (stored as text)');

-- END: data/grid_cells.sql

-- PHASE 5: POST-LOAD INDEXES
-- ECHO: ''
-- ECHO: 'Phase 5: Additional Indexes'
-- No additional indexes needed (all created with their tables)

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
    RAISE NOTICE 'Models:  %', model_count;
    RAISE NOTICE 'Users:    %', user_count;
    RAISE NOTICE '';
END $$;

COMMIT;

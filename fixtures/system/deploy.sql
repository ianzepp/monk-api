-- Compiled Fixture: system
-- Generated: 2025-11-23T14:59:23.773Z
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
    FOREIGN KEY ("model_name") REFERENCES "public"."models"("model_name")
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
    FOREIGN KEY ("extract_id") REFERENCES "public"."extracts"("id")
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
    FOREIGN KEY ("run_id") REFERENCES "public"."extract_runs"("id")
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
-- DATA: Model registrations
-- ============================================================================
-- Register all system models in the models table
-- This enables recursive model discovery via the Data API

-- models table (self-reference for recursive discovery)
INSERT INTO "models" (model_name, status, sudo)
VALUES ('models', 'system', true);

-- fields table (self-reference for recursive discovery)
INSERT INTO "models" (model_name, status, sudo)
VALUES ('fields', 'system', true);

-- users table
INSERT INTO "models" (model_name, status, sudo)
VALUES ('users', 'system', true);

-- history table (change tracking / audit trail)
INSERT INTO "models" (model_name, status, sudo)
VALUES ('history', 'system', true);

-- snapshots table (point-in-time database backups)
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'snapshots',
    'system',
    true,
    'Point-in-time database backups created via async observer pipeline'
);

-- END: data/models.sql
-- BEGIN: data/fields.sql
-- ============================================================================
-- DATA: Field definitions for system models
-- ============================================================================
-- These define the portable (non-system) fields for core models
-- System fields (id, access_*, created_at, etc.) are automatically added
-- to all tables and should NOT be included here

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

-- ============================================================================
-- FIELDS FOR: users
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('users', 'name', 'text', true, 'User display name'),
    ('users', 'auth', 'text', true, 'Authentication identifier'),
    ('users', 'access', 'text', true, 'User access level (root, full, edit, read, deny)');

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

-- ============================================================================
-- FIELDS FOR: snapshots
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('snapshots', 'name', 'text', true, 'Snapshot identifier'),
    ('snapshots', 'database', 'text', true, 'PostgreSQL database name (format: snapshot_{random})'),
    ('snapshots', 'description', 'text', false, 'Optional description of snapshot purpose'),
    ('snapshots', 'status', 'text', true, 'Processing status: pending, processing, active, failed'),
    ('snapshots', 'snapshot_type', 'text', true, 'Type: manual, auto, pre_migration, scheduled'),
    ('snapshots', 'size_bytes', 'bigint', false, 'Snapshot database size in bytes'),
    ('snapshots', 'record_count', 'integer', false, 'Total records at snapshot time'),
    ('snapshots', 'error_message', 'text', false, 'Error details if status is failed'),
    ('snapshots', 'created_by', 'uuid', true, 'User who created the snapshot'),
    ('snapshots', 'expires_at', 'timestamp', false, 'Retention policy expiration time');

-- END: data/fields.sql
-- BEGIN: data/users.sql
-- ============================================================================
-- DATA: Default users
-- ============================================================================
-- Insert default root user for initial access

INSERT INTO users (name, auth, access) VALUES
    ('root', 'root', 'root')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Default template includes pre-configured root user for initial login';

-- END: data/users.sql
-- BEGIN: data/history.sql
-- ============================================================================
-- DATA: Register history model
-- ============================================================================

INSERT INTO "models" (model_name, status, description)
VALUES (
    'history',
    'system',
    'Change tracking and audit trail'
);

-- END: data/history.sql
-- MISSING: \ir data/extracts.sql        -- Extracts system (registers models + fields)
-- MISSING: \ir data/restores.sql        -- Restores system (registers models + fields)
-- MISSING: \ir data/grids.sql           -- Grid API metadata (registers models + fields)
-- MISSING: \ir data/grid_cells.sql      -- Grid API cells - external model (registers models + fields)

-- PHASE 5: POST-LOAD INDEXES
-- ECHO: ''
-- ECHO: 'Phase 5: Additional Indexes'
-- MISSING: \ir describe/history.sql    -- Creates composite index on history

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

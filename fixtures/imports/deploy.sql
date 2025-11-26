-- Compiled Fixture: imports
-- Generated: 2025-11-25T23:20:54.999Z
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
-- Monk API - Imports Fixture Loader
-- ============================================================================
-- Provides data import and restore pipeline functionality
--
-- Dependencies: system
-- Models: restores, restore_runs, restore_logs

-- ECHO: '========================================'
-- ECHO: 'Loading Imports Fixture'
-- ECHO: '========================================'

-- TABLE DEFINITIONS
-- ECHO: ''
-- ECHO: 'Table Definitions'
-- BEGIN: describe/restores.sql
-- ============================================================================
-- MODEL: restores
-- ============================================================================
-- Restore/import job configurations

CREATE TABLE "restores" (
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

	-- Configuration
	"name" text NOT NULL,
	"description" text,
	"source_type" text DEFAULT 'upload' NOT NULL CHECK ("source_type" IN ('upload', 'extract_run', 'url')),
	"source_ref" text,
	"conflict_strategy" text DEFAULT 'upsert' NOT NULL CHECK ("conflict_strategy" IN ('replace', 'upsert', 'merge', 'sync', 'skip', 'error')),
	"include" text[] DEFAULT ARRAY['describe', 'data']::text[],
	"models" text[],
	"create_models" boolean DEFAULT true,
	"enabled" boolean DEFAULT true,

	-- Stats (denormalized)
	"last_run_id" uuid,
	"last_run_at" timestamp,
	"total_runs" integer DEFAULT 0,
	"successful_runs" integer DEFAULT 0,
	"failed_runs" integer DEFAULT 0
);

CREATE INDEX "idx_restores_enabled" ON "restores" ("enabled");
CREATE INDEX "idx_restores_source_type" ON "restores" ("source_type");

-- END: describe/restores.sql
-- BEGIN: describe/restore_runs.sql
-- ============================================================================
-- MODEL: restore_runs
-- ============================================================================
-- Individual execution runs of restore jobs

CREATE TABLE "restore_runs" (
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
	"restore_id" uuid NOT NULL,
	"restore_name" text,
	"source_filename" text,

	-- Execution state
	"status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
	"progress" integer DEFAULT 0 CHECK ("progress" BETWEEN 0 AND 100),
	"progress_detail" jsonb,

	-- Timing
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_seconds" integer,

	-- Results
	"records_imported" integer DEFAULT 0,
	"records_skipped" integer DEFAULT 0,
	"records_updated" integer DEFAULT 0,
	"models_created" integer DEFAULT 0,
	"fields_created" integer DEFAULT 0,

	-- Error handling
	"error" text,
	"error_detail" text,

	-- Configuration snapshot
	"config_snapshot" jsonb
);

-- Foreign key
ALTER TABLE "restore_runs" ADD CONSTRAINT "restore_runs_restore_id_fk"
    FOREIGN KEY ("restore_id") REFERENCES "restores"("id")
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_restore_runs_restore_id" ON "restore_runs" ("restore_id");
CREATE INDEX "idx_restore_runs_status" ON "restore_runs" ("status");
CREATE INDEX "idx_restore_runs_created_at" ON "restore_runs" ("created_at" DESC);

-- END: describe/restore_runs.sql
-- BEGIN: describe/restore_logs.sql
-- ============================================================================
-- MODEL: restore_logs
-- ============================================================================
-- Detailed logging for restore operations (info, warnings, errors)

CREATE TABLE "restore_logs" (
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
	"run_id" uuid NOT NULL,

	-- Log entry
	"level" text NOT NULL CHECK ("level" IN ('info', 'warn', 'error')),
	"phase" text CHECK ("phase" IS NULL OR "phase" IN ('upload', 'validation', 'describe_import', 'data_import')),
	"model_name" text,
	"record_id" text,
	"message" text NOT NULL,
	"detail" jsonb
);

-- Foreign key
ALTER TABLE "restore_logs" ADD CONSTRAINT "restore_logs_run_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "restore_runs"("id")
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_restore_logs_run_id" ON "restore_logs" ("run_id");
CREATE INDEX "idx_restore_logs_level" ON "restore_logs" ("level");
CREATE INDEX "idx_restore_logs_created_at" ON "restore_logs" ("created_at" DESC);

-- END: describe/restore_logs.sql

-- DATA
-- ECHO: ''
-- ECHO: 'Data Inserts'
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

-- ECHO: ''
-- ECHO: '========================================'
-- ECHO: 'Imports Fixture Loaded Successfully'
-- ECHO: '========================================'

COMMIT;

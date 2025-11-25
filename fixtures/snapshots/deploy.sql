-- Compiled Fixture: snapshots
-- Generated: 2025-11-25T23:20:54.580Z
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
-- Monk API - Snapshots Fixture Loader
-- ============================================================================
-- Provides point-in-time tenant snapshot functionality
--
-- Dependencies: system
-- Models: snapshots

-- ECHO: '========================================'
-- ECHO: 'Loading Snapshots Fixture'
-- ECHO: '========================================'

-- TABLE DEFINITIONS
-- ECHO: ''
-- ECHO: 'Table Definitions'
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

-- DATA
-- ECHO: ''
-- ECHO: 'Data Inserts'
-- BEGIN: data/snapshots.sql
-- ============================================================================
-- DATA: Snapshots model registration
-- ============================================================================

-- Register snapshots model
INSERT INTO "models" (model_name, status, sudo)
VALUES ('snapshots', 'system', true);

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

-- END: data/snapshots.sql

-- ECHO: ''
-- ECHO: '========================================'
-- ECHO: 'Snapshots Fixture Loaded Successfully'
-- ECHO: '========================================'

COMMIT;

-- Compiled Fixture: audit
-- Generated: 2025-11-25T23:20:54.370Z
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
-- Monk API - Audit Fixture Loader
-- ============================================================================
-- Provides audit trail and change tracking functionality
--
-- Dependencies: system
-- Models: history

-- ECHO: '========================================'
-- ECHO: 'Loading Audit Fixture'
-- ECHO: '========================================'

-- TABLE DEFINITIONS
-- ECHO: ''
-- ECHO: 'Table Definitions'
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

-- DATA
-- ECHO: ''
-- ECHO: 'Data Inserts'
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

-- ECHO: ''
-- ECHO: '========================================'
-- ECHO: 'Audit Fixture Loaded Successfully'
-- ECHO: '========================================'

COMMIT;

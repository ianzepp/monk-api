-- Compiled Fixture: grids
-- Generated: 2025-11-25T23:20:55.205Z
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
-- Monk API - Grids Fixture Loader
-- ============================================================================
-- Provides Excel-style grid definitions and cell data functionality
--
-- Dependencies: system
-- Models: grids, grid_cells

-- ECHO: '========================================'
-- ECHO: 'Loading Grids Fixture'
-- ECHO: '========================================'

-- TABLE DEFINITIONS
-- ECHO: ''
-- ECHO: 'Table Definitions'
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

-- DATA
-- ECHO: ''
-- ECHO: 'Data Inserts'
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

-- ECHO: ''
-- ECHO: '========================================'
-- ECHO: 'Grids Fixture Loaded Successfully'
-- ECHO: '========================================'

COMMIT;

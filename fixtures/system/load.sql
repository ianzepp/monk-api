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

\echo '========================================'
\echo 'Loading System Fixture'
\echo '========================================'

-- PHASE 1: INITIALIZATION
\echo ''
\echo 'Phase 1: Initialization (extensions, types)'

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

-- PHASE 2: TABLE DEFINITIONS (DDL)
\echo ''
\echo 'Phase 2: Table Definitions'
\ir describe/schemas.sql
\ir describe/columns.sql
\ir describe/users.sql
\ir describe/snapshots.sql
\ir describe/extracts.sql
\ir describe/extract_runs.sql
\ir describe/extract_artifacts.sql
\ir describe/restores.sql
\ir describe/restore_runs.sql
\ir describe/restore_logs.sql
\ir describe/grids.sql
\ir describe/grid_cells.sql
\ir describe/history.sql

-- PHASE 3: FUNCTIONS
\echo ''
\echo 'Phase 3: Functions & Triggers'
-- No functions needed

-- PHASE 4: DATA (DML)
\echo ''
\echo 'Phase 4: Data Inserts'
\ir data/schemas.sql
\ir data/columns.sql
\ir data/users.sql
\ir data/history.sql
\ir data/extracts.sql        -- Extracts system (registers schemas + columns)
\ir data/restores.sql        -- Restores system (registers schemas + columns)
\ir data/grids.sql           -- Grid API metadata (registers schemas + columns)
\ir data/grid_cells.sql      -- Grid API cells - external schema (registers schemas + columns)

-- PHASE 5: POST-LOAD INDEXES
\echo ''
\echo 'Phase 5: Additional Indexes'
\ir describe/history.sql    -- Creates composite index on history

-- SUMMARY
\echo ''
\echo '========================================'
\echo 'System Fixture Loaded Successfully'
\echo '========================================'

DO $$
DECLARE
    schema_count INTEGER;
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO schema_count FROM "schemas";
    SELECT COUNT(*) INTO user_count FROM "users";

    RAISE NOTICE '';
    RAISE NOTICE 'Database: %', current_database();
    RAISE NOTICE 'Schemas:  %', schema_count;
    RAISE NOTICE 'Users:    %', user_count;
    RAISE NOTICE '';
END $$;

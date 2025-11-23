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
\echo ''
\echo 'Phase 2: Table Definitions'
\ir describe/models.sql
\ir describe/fields.sql
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
\ir data/models.sql
\ir data/fields.sql
\ir data/users.sql
\ir data/history.sql
\ir data/extracts.sql        -- Extracts system (registers models + fields)
\ir data/restores.sql        -- Restores system (registers models + fields)
\ir data/grids.sql           -- Grid API metadata (registers models + fields)
\ir data/grid_cells.sql      -- Grid API cells - external model (registers models + fields)

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

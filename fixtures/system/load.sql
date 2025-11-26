-- ============================================================================
-- Monk API - System Fixture Loader
-- ============================================================================
-- Core system fixture with essential infrastructure models
--
-- Dependencies: none
-- Models: models, fields, users, filters
--
-- Usage:
--   createdb monk_template_system
--   psql -d monk_template_system -f fixtures/system/load.sql

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
\echo ''
\echo 'Phase 2: Table Definitions'
\ir describe/models.sql
\ir describe/fields.sql
\ir describe/users.sql
\ir describe/filters.sql

-- PHASE 3: DATA (DML)
\echo ''
\echo 'Phase 3: Data Inserts'
\ir data/models.sql
\ir data/fields.sql
\ir data/users.sql
\ir data/filters.sql

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
    RAISE NOTICE 'Models:   %', model_count;
    RAISE NOTICE 'Users:    %', user_count;
    RAISE NOTICE '';
END $$;

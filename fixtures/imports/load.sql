-- ============================================================================
-- Monk API - Imports Fixture Loader
-- ============================================================================
-- Provides data import and restore pipeline functionality
--
-- Dependencies: system
-- Models: restores, restore_runs, restore_logs

\echo '========================================'
\echo 'Loading Imports Fixture'
\echo '========================================'

-- TABLE DEFINITIONS
\echo ''
\echo 'Table Definitions'
\ir describe/restores.sql
\ir describe/restore_runs.sql
\ir describe/restore_logs.sql

-- DATA
\echo ''
\echo 'Data Inserts'
\ir data/restores.sql

\echo ''
\echo '========================================'
\echo 'Imports Fixture Loaded Successfully'
\echo '========================================'

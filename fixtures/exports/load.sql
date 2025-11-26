-- ============================================================================
-- Monk API - Exports Fixture Loader
-- ============================================================================
-- Provides data export pipeline functionality
--
-- Dependencies: system
-- Models: extracts, extract_runs, extract_artifacts

\echo '========================================'
\echo 'Loading Exports Fixture'
\echo '========================================'

-- TABLE DEFINITIONS
\echo ''
\echo 'Table Definitions'
\ir describe/extracts.sql
\ir describe/extract_runs.sql
\ir describe/extract_artifacts.sql

-- DATA
\echo ''
\echo 'Data Inserts'
\ir data/extracts.sql

\echo ''
\echo '========================================'
\echo 'Exports Fixture Loaded Successfully'
\echo '========================================'

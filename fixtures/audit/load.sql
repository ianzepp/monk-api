-- ============================================================================
-- Monk API - Audit Fixture Loader
-- ============================================================================
-- Provides audit trail and change tracking functionality
--
-- Dependencies: system
-- Models: history

\echo '========================================'
\echo 'Loading Audit Fixture'
\echo '========================================'

-- TABLE DEFINITIONS
\echo ''
\echo 'Table Definitions'
\ir describe/history.sql

-- DATA
\echo ''
\echo 'Data Inserts'
\ir data/history.sql

\echo ''
\echo '========================================'
\echo 'Audit Fixture Loaded Successfully'
\echo '========================================'

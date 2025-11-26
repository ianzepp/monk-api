-- ============================================================================
-- Monk API - Snapshots Fixture Loader
-- ============================================================================
-- Provides point-in-time tenant snapshot functionality
--
-- Dependencies: system
-- Models: snapshots

\echo '========================================'
\echo 'Loading Snapshots Fixture'
\echo '========================================'

-- TABLE DEFINITIONS
\echo ''
\echo 'Table Definitions'
\ir describe/snapshots.sql

-- DATA
\echo ''
\echo 'Data Inserts'
\ir data/snapshots.sql

\echo ''
\echo '========================================'
\echo 'Snapshots Fixture Loaded Successfully'
\echo '========================================'

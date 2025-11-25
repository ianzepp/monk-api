-- ============================================================================
-- Testing Fixture Loader
-- ============================================================================
-- Loads testing template with minimal sample models for test suite
-- Extends: system template
--
-- Load Order:
-- 1. User initialization (init.sql)
-- 2. Model definitions (describe/*.sql)
-- 3. Sample data (data/*.sql)

\echo ''
\echo '=========================================='
\echo 'Loading Testing Fixture'
\echo '=========================================='
\echo ''

-- Phase 1: Model definitions
\echo '→ Phase 2: Model definitions'
\ir describe/accounts.sql
\ir describe/contacts.sql
\echo '✓ Models loaded: 2'
\echo ''

-- Phase 2: Sample data
\echo '→ Phase 3: Sample data'
\ir data/accounts.sql
\ir data/contacts.sql
\ir data/users.sql
\echo '✓ Data loaded: 3 tables'
\echo ''

\echo '=========================================='
\echo '✓ Testing Fixture Loaded Successfully'
\echo '=========================================='
\echo ''

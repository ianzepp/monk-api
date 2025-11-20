-- ============================================================================
-- Testing Fixture Loader
-- ============================================================================
-- Loads testing template with minimal sample schemas for test suite
-- Extends: system template
--
-- Load Order:
-- 1. User initialization (init.sql)
-- 2. Schema definitions (describe/*.sql)
-- 3. Sample data (data/*.sql)

\echo ''
\echo '=========================================='
\echo 'Loading Testing Fixture'
\echo '=========================================='
\echo ''

-- Phase 1: User initialization
\echo '→ Phase 1: User initialization'
\ir init.sql
\echo '✓ Users initialized'
\echo ''

-- Phase 2: Schema definitions
\echo '→ Phase 2: Schema definitions'
\ir describe/account.sql
\ir describe/contact.sql
\echo '✓ Schemas loaded: 2'
\echo ''

-- Phase 3: Sample data
\echo '→ Phase 3: Sample data'
\ir data/account.sql
\ir data/contact.sql
\echo '✓ Data loaded: 2 tables'
\echo ''

\echo '=========================================='
\echo '✓ Testing Fixture Loaded Successfully'
\echo '=========================================='
\echo ''

-- ============================================================================
-- Monk API - Grids Fixture Loader
-- ============================================================================
-- Provides Excel-style grid definitions and cell data functionality
--
-- Dependencies: system
-- Models: grids, grid_cells

\echo '========================================'
\echo 'Loading Grids Fixture'
\echo '========================================'

-- TABLE DEFINITIONS
\echo ''
\echo 'Table Definitions'
\ir describe/grids.sql
\ir describe/grid_cells.sql

-- DATA
\echo ''
\echo 'Data Inserts'
\ir data/grids.sql
\ir data/grid_cells.sql

\echo ''
\echo '========================================'
\echo 'Grids Fixture Loaded Successfully'
\echo '========================================'

-- Migration: Remove definitions table and JSON Schema infrastructure
-- Date: 2025-01-XX
-- Reason: Migrated from AJV-based JSON Schema validation to in-house validators
--
-- This removes:
-- - definitions table (stored compiled JSON schemas)
-- - regenerate_schema_definition() function
-- - trigger_regenerate_schema_definitions() function
-- - Trigger on columns table
-- - Schema registration for definitions

-- ============================================================================
-- PART 1: Remove trigger and functions
-- ============================================================================

-- Drop trigger first (depends on function)
DROP TRIGGER IF EXISTS trigger_columns_regenerate_definitions ON columns;

-- Drop trigger function
DROP FUNCTION IF EXISTS trigger_regenerate_schema_definitions();

-- Drop schema definition regeneration function
DROP FUNCTION IF EXISTS regenerate_schema_definition(text);

-- ============================================================================
-- PART 2: Remove definitions table
-- ============================================================================

-- Drop table with CASCADE to remove any dependent objects
DROP TABLE IF EXISTS definitions CASCADE;

-- ============================================================================
-- PART 3: Remove schema registration
-- ============================================================================

-- Remove definitions from schemas table
DELETE FROM schemas WHERE schema_name = 'definitions';

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Definitions Table Cleanup Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Removed:';
    RAISE NOTICE '- trigger_columns_regenerate_definitions trigger';
    RAISE NOTICE '- trigger_regenerate_schema_definitions() function';
    RAISE NOTICE '- regenerate_schema_definition(text) function';
    RAISE NOTICE '- definitions table';
    RAISE NOTICE '- definitions schema registration';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Validation now handled by in-house validators';
    RAISE NOTICE '';
END $$;

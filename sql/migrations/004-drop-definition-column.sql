-- Migration: Drop definition column from schemas table
-- The definition column has been moved to the definitions table

-- Drop the definition column from schemas table
ALTER TABLE schemas DROP COLUMN IF EXISTS definition;

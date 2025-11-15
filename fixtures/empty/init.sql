-- Fixture-specific initialization for 'empty' template
-- This runs after init-tenant.sql but before schemas and data are loaded

-- Add a comment to demonstrate the init.sql executed successfully
COMMENT ON SCHEMA public IS 'Empty fixture template - initialized via init.sql';

-- You can add fixture-specific initialization here, such as:
-- - Custom functions
-- - Extensions
-- - Seed data that needs to be in place before schemas
-- - Database-level configuration

-- Migration 002: Rename auth database structure
-- This migration updates the auth database structure for the new naming convention
--
-- IMPORTANT: This migration assumes you are running it on the OLD monk-api-auth database
-- and want to migrate to the new 'monk' database with 'tenant' table structure.
--
-- Usage:
--   1. Dump existing data: pg_dump monk-api-auth > auth_backup.sql
--   2. Create new database: createdb monk
--   3. Initialize new structure: psql -d monk -f sql/init-auth.sql
--   4. Migrate data: psql -d monk -f sql/migrations/002-rename-auth-database-structure.sql
--
-- Note: This script assumes the old database has been renamed or data exported

-- Temporary function to help with data migration
-- This would be used if migrating data from old tenants table format

-- Example migration queries (uncomment and modify as needed):

-- If migrating from existing monk-api-auth database tenants table:
-- INSERT INTO tenant (name, database, host, is_active, created_at, updated_at)
-- SELECT 
--     name,
--     -- Convert old monk-api$tenant-name format to new direct naming
--     CASE 
--         WHEN database LIKE 'monk-api$%' THEN REPLACE(database, 'monk-api$', '')
--         ELSE database 
--     END as database,
--     host,
--     is_active,
--     created_at,
--     updated_at
-- FROM old_tenants_backup;

-- Manual steps needed:
-- 1. Export tenant databases with old monk-api$ prefix
-- 2. Create new databases with direct tenant names  
-- 3. Import data into new databases
-- 4. Update tenant registry to point to new database names

-- Example script for database renaming (run as postgres user):
-- ALTER DATABASE "monk-api$my-tenant" RENAME TO "my_tenant";

COMMENT ON SCHEMA public IS 'Migration 002: Database structure renamed from monk-api-auth/tenants to monk/tenant';
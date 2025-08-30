-- Migration: Convert table names from singular to plural forms
-- Converts system tables to follow standard database naming conventions and AI agent expectations

-- Auth Database (monk-api-auth)
-- Convert tenant table to tenants table
DO $$
BEGIN
    -- Check if tenant table exists and tenants doesn't
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenant') 
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenants') THEN
        
        ALTER TABLE "tenant" RENAME TO "tenants";
        
        -- Update any triggers or indexes that reference the old table name
        -- The trigger update_tenant_updated_at should be automatically renamed to update_tenants_updated_at
        
        RAISE NOTICE 'Successfully renamed tenant table to tenants';
    ELSE
        RAISE NOTICE 'Tenant table migration skipped (tenants table already exists or tenant table not found)';
    END IF;
END
$$;

-- Tenant Databases (monk-api$tenant-name)
-- Convert schema table to schemas table and update checksum column
DO $$
BEGIN
    -- Check if schema table exists and schemas doesn't
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema') 
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schemas') THEN
        
        -- Rename table
        ALTER TABLE "schema" RENAME TO "schemas";
        
        -- Rename yaml_checksum column to json_checksum if it exists
        IF EXISTS (SELECT FROM information_schema.columns 
                  WHERE table_name = 'schemas' AND column_name = 'yaml_checksum') THEN
            ALTER TABLE "schemas" RENAME COLUMN "yaml_checksum" TO "json_checksum";
            RAISE NOTICE 'Renamed yaml_checksum column to json_checksum';
        END IF;
        
        -- Update any triggers or indexes that reference the old table name
        -- The trigger update_schema_updated_at should be automatically renamed to update_schemas_updated_at
        
        RAISE NOTICE 'Successfully renamed schema table to schemas';
    ELSE
        RAISE NOTICE 'Schema table migration skipped (schemas table already exists or schema table not found)';
    END IF;
END
$$;

-- User schema tables (created dynamically by metabase)
-- Note: User-defined tables (accounts, contacts, etc.) don't need migration
-- since they will be created with plural names going forward.
-- Existing user tables would need to be migrated on a case-by-case basis.

COMMENT ON SCHEMA public IS 'Tables converted to plural forms for AI agent compatibility and standard database conventions';
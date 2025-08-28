-- Monk API Auth Database Initialization Script  
-- This script creates the required tables for the monk database
--
-- Usage:
--   createdb monk
--   psql -d monk -f sql/init-auth.sql
--
-- The auth database serves as the central registry for multi-tenant operations,
-- storing tenant configurations and routing information for domain-based authentication.

-- Tenant registry table to store multi-tenant database routing information
-- This table maps tenant names to their respective databases and hosts
-- Structure matches metabase YAML schema format for consistency
CREATE TABLE "tenant" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" VARCHAR(255) NOT NULL UNIQUE,          -- Unique tenant identifier
    "database" VARCHAR(255) NOT NULL,             -- Target database name (direct tenant name)
    "host" VARCHAR(255) DEFAULT 'localhost',      -- Database host (future multi-host support)
    "is_active" BOOLEAN DEFAULT true,             -- Enable/disable tenant access
    "access_read" uuid[] DEFAULT '{}'::uuid[],    -- ACL read access
    "access_edit" uuid[] DEFAULT '{}'::uuid[],    -- ACL edit access  
    "access_full" uuid[] DEFAULT '{}'::uuid[],    -- ACL full access
    "access_deny" uuid[] DEFAULT '{}'::uuid[],    -- ACL deny access
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TIMESTAMP,                       -- Soft delete timestamp
    "deleted_at" TIMESTAMP                        -- Hard delete timestamp
);

-- Create index for faster tenant lookups during authentication
CREATE INDEX "idx_tenant_name_active" ON "tenant" ("name", "is_active");
CREATE INDEX "idx_tenant_database" ON "tenant" ("database");
CREATE INDEX "idx_tenant_trashed" ON "tenant" ("trashed_at") WHERE "trashed_at" IS NOT NULL;
CREATE INDEX "idx_tenant_deleted" ON "tenant" ("deleted_at") WHERE "deleted_at" IS NOT NULL;

-- Add comments to document the table structure
COMMENT ON TABLE "tenant" IS 'Registry of multi-tenant databases for domain-based routing';
COMMENT ON COLUMN "tenant"."id" IS 'UUID primary key for tenant record';
COMMENT ON COLUMN "tenant"."name" IS 'Unique tenant identifier used in authentication';  
COMMENT ON COLUMN "tenant"."database" IS 'PostgreSQL database name containing tenant data (direct tenant name)';
COMMENT ON COLUMN "tenant"."host" IS 'Database host for future distributed deployment support';
COMMENT ON COLUMN "tenant"."is_active" IS 'Whether tenant is enabled for authentication';
COMMENT ON COLUMN "tenant"."access_read" IS 'UUID array for read access control';
COMMENT ON COLUMN "tenant"."access_edit" IS 'UUID array for edit access control';
COMMENT ON COLUMN "tenant"."access_full" IS 'UUID array for full access control';
COMMENT ON COLUMN "tenant"."access_deny" IS 'UUID array for deny access control';
COMMENT ON COLUMN "tenant"."created_at" IS 'Timestamp when tenant was first created';
COMMENT ON COLUMN "tenant"."updated_at" IS 'Timestamp when tenant configuration was last modified';
COMMENT ON COLUMN "tenant"."trashed_at" IS 'Timestamp when tenant was soft deleted';
COMMENT ON COLUMN "tenant"."deleted_at" IS 'Timestamp when tenant was hard deleted';

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenant_updated_at 
    BEFORE UPDATE ON "tenant" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default system tenant for development and testing
-- This provides a standard tenant for local development work
INSERT INTO "tenant" (name, database, host, is_active) 
VALUES ('system', 'system', 'localhost', true)
ON CONFLICT (name) DO NOTHING;
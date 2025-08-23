-- Monk API Auth Database Initialization Script  
-- This script creates the required tables for the monk-api-auth database
--
-- Usage:
--   createdb monk-api-auth
--   psql -d monk-api-auth -f sql/init-auth.sql
--
-- The auth database serves as the central registry for multi-tenant operations,
-- storing tenant configurations and routing information for domain-based authentication.

-- Tenants registry table to store multi-tenant database routing information
-- This table maps tenant names to their respective databases and hosts
CREATE TABLE "tenants" (
    "name" VARCHAR(255) PRIMARY KEY,              -- Unique tenant identifier
    "database" VARCHAR(255) NOT NULL,             -- Target database name (e.g., monk-api$tenant-name)  
    "host" VARCHAR(255) DEFAULT 'localhost',      -- Database host (future multi-host support)
    "is_active" BOOLEAN DEFAULT true,             -- Enable/disable tenant access
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Tenant creation timestamp
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- Last modification timestamp
);

-- Create index for faster tenant lookups during authentication
CREATE INDEX "idx_tenants_name_active" ON "tenants" ("name", "is_active");
CREATE INDEX "idx_tenants_database" ON "tenants" ("database");

-- Add comments to document the table structure
COMMENT ON TABLE "tenants" IS 'Registry of multi-tenant databases for domain-based routing';
COMMENT ON COLUMN "tenants"."name" IS 'Unique tenant identifier used in authentication';  
COMMENT ON COLUMN "tenants"."database" IS 'PostgreSQL database name containing tenant data';
COMMENT ON COLUMN "tenants"."host" IS 'Database host for future distributed deployment support';
COMMENT ON COLUMN "tenants"."is_active" IS 'Whether tenant is enabled for authentication';
COMMENT ON COLUMN "tenants"."created_at" IS 'Timestamp when tenant was first created';
COMMENT ON COLUMN "tenants"."updated_at" IS 'Timestamp when tenant configuration was last modified';

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at 
    BEFORE UPDATE ON "tenants" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default system tenant for development and testing
-- This provides a standard tenant for local development work
INSERT INTO "tenants" (name, database, host, is_active) 
VALUES ('system', 'monk-api$system', 'localhost', true)
ON CONFLICT (name) DO NOTHING;
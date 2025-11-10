-- Monk API Main Database Initialization Script
-- This script creates the required tables for the monk database
--
-- Usage:
--   createdb monk
--   psql -d monk -f sql/init-monk-main.sql
--
-- The main database serves as the central registry for multi-tenant operations,
-- storing tenant configurations and routing information for domain-based authentication.

-- tenants registry table to store multi-tenant database routing information
-- This table maps tenants names to their respective databases and hosts
-- Structure matches describe JSON schema format for consistency
CREATE TABLE "tenants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" VARCHAR(255) NOT NULL UNIQUE,          -- Unique tenants identifier
    "database" VARCHAR(255) NOT NULL,             -- Target database name (direct tenant name)
    "host" VARCHAR(255) DEFAULT 'localhost',      -- Database host (future multi-host support)
    "is_active" BOOLEAN DEFAULT true,             -- Enable/disable tenants access
    "tenant_type" VARCHAR(20) DEFAULT 'normal', -- Tenant type: 'normal' or 'template'
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
CREATE INDEX "idx_tenants_name_active" ON "tenants" ("name", "is_active");
CREATE INDEX "idx_tenants_database" ON "tenants" ("database");
CREATE INDEX "idx_tenants_tenant_type" ON "tenants" ("tenant_type");
CREATE INDEX "idx_tenants_trashed" ON "tenants" ("trashed_at") WHERE "trashed_at" IS NOT NULL;
CREATE INDEX "idx_tenants_deleted" ON "tenants" ("deleted_at") WHERE "deleted_at" IS NOT NULL;

-- Add comments to document the table structure
COMMENT ON TABLE "tenants" IS 'Registry of multi-tenant databases for domain-based routing';
COMMENT ON COLUMN "tenants"."id" IS 'UUID primary key for tenant record';
COMMENT ON COLUMN "tenants"."name" IS 'Unique tenant identifier used in authentication';
COMMENT ON COLUMN "tenants"."database" IS 'PostgreSQL database name containing tenant data (direct tenants name)';
COMMENT ON COLUMN "tenants"."host" IS 'Database host for future distributed deployment support';
COMMENT ON COLUMN "tenants"."is_active" IS 'Whether tenant is enabled for authentication';
COMMENT ON COLUMN "tenants"."tenant_type" IS 'Tenant type: normal (regular tenant) or template (fixture template for cloning)';
COMMENT ON COLUMN "tenants"."access_read" IS 'UUID array for read access control';
COMMENT ON COLUMN "tenants"."access_edit" IS 'UUID array for edit access control';
COMMENT ON COLUMN "tenants"."access_full" IS 'UUID array for full access control';
COMMENT ON COLUMN "tenants"."access_deny" IS 'UUID array for deny access control';
COMMENT ON COLUMN "tenants"."created_at" IS 'Timestamp when tenant was first created';
COMMENT ON COLUMN "tenants"."updated_at" IS 'Timestamp when tenant configuration was last modified';
COMMENT ON COLUMN "tenants"."trashed_at" IS 'Timestamp when tenant was soft deleted';
COMMENT ON COLUMN "tenants"."deleted_at" IS 'Timestamp when tenant was hard deleted';

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
VALUES ('system', 'system', 'localhost', true)
ON CONFLICT (name) DO NOTHING;

-- Request Tracking Table
-- Records all API requests for analytics, monitoring, and connection health checking
CREATE TABLE "requests" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "timestamp" TIMESTAMP DEFAULT NOW() NOT NULL,
    "method" VARCHAR(10) NOT NULL,                    -- GET, POST, PUT, DELETE
    "url" TEXT NOT NULL,                              -- Full request URL
    "path" TEXT NOT NULL,                             -- URL path (/api/data/users)
    "api" VARCHAR(20),                                -- Extracted API (auth, data, meta, file)
    "ip_address" INET,                                -- Client IP
    "user_agent" TEXT,                                -- Client info

    -- Standard system fields for consistency
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for performance
CREATE INDEX "idx_requests_timestamp" ON "requests" ("timestamp");

-- Add comments
COMMENT ON TABLE "requests" IS 'API request tracking for analytics, monitoring, and connection health verification';
COMMENT ON COLUMN "requests"."api" IS 'Extracted API category from path (auth, data, meta, file, bulk, find, docs, root)';
COMMENT ON COLUMN "requests"."ip_address" IS 'Client IP address from headers or connection';
COMMENT ON COLUMN "requests"."user_agent" IS 'HTTP User-Agent header for client identification';

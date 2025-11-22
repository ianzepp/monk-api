-- Monk API Infrastructure Database Initialization Script
-- This script creates the required tables for the monk database
--
-- Usage:
--   createdb monk
--   psql -d monk -f fixtures/infrastructure/init.sql
--
-- The monk database serves as the central registry for multi-tenant operations,
-- storing infrastructure metadata and routing information for domain-based authentication.

-- ============================================================================
-- TEMPLATES TABLE
-- Immutable database prototypes for cloning new tenants and sandboxes
-- ============================================================================
CREATE TABLE IF NOT EXISTS "templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" VARCHAR(255) NOT NULL UNIQUE,              -- Template identifier (e.g., 'default', 'testing')
    "database" VARCHAR(255) NOT NULL UNIQUE,          -- Database name: monk_template_{name}
    "version" INTEGER DEFAULT 1 NOT NULL,             -- Template schema version for migrations
    "description" TEXT,                               -- Human-readable description
    "parent_template" VARCHAR(255),                   -- Source template if derived
    "is_system" BOOLEAN DEFAULT false NOT NULL,       -- System template (cannot be deleted)
    "schema_count" INTEGER DEFAULT 0,                 -- Number of schemas defined
    "record_count" INTEGER DEFAULT 0,                 -- Total records across all schemas
    "size_bytes" BIGINT,                              -- Database size in bytes
    "created_by" uuid,                                -- User who created template (NULL for system)
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "access_read" uuid[] DEFAULT '{}'::uuid[],        -- ACL read access
    "access_edit" uuid[] DEFAULT '{}'::uuid[],        -- ACL edit access
    "access_full" uuid[] DEFAULT '{}'::uuid[],        -- ACL full access
    CONSTRAINT "templates_database_prefix" CHECK ("database" LIKE 'monk_template_%')
);

CREATE INDEX "idx_templates_parent" ON "templates" ("parent_template");
CREATE INDEX "idx_templates_system" ON "templates" ("is_system");
CREATE INDEX "idx_templates_created_by" ON "templates" ("created_by");
CREATE INDEX "idx_templates_version" ON "templates" ("version");

COMMENT ON TABLE "templates" IS 'Immutable database templates for cloning tenants and sandboxes';
COMMENT ON COLUMN "templates"."name" IS 'Template identifier used in API (e.g., default, testing, demo)';
COMMENT ON COLUMN "templates"."database" IS 'PostgreSQL database name (format: monk_template_{name})';
COMMENT ON COLUMN "templates"."version" IS 'Template schema version for tracking migrations and feature availability';
COMMENT ON COLUMN "templates"."parent_template" IS 'Source template if this was derived from another';
COMMENT ON COLUMN "templates"."is_system" IS 'System template flag (prevents deletion)';
COMMENT ON COLUMN "templates"."schema_count" IS 'Number of schemas defined in template';
COMMENT ON COLUMN "templates"."record_count" IS 'Total records across all schemas';
COMMENT ON COLUMN "templates"."size_bytes" IS 'Database size in bytes for capacity planning';

-- ============================================================================
-- TENANTS TABLE
-- Production tenant databases for real users and organizations
-- ============================================================================
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" VARCHAR(255) NOT NULL UNIQUE,              -- Tenant identifier for authentication
    "database" VARCHAR(255) NOT NULL UNIQUE,          -- Database name: tenant_{hash} or tenant_{name}
    "template_version" INTEGER DEFAULT 1 NOT NULL,    -- Version of template used for creation
    "description" TEXT,                               -- Optional description
    "source_template" VARCHAR(255),                   -- Template used for creation
    "naming_mode" VARCHAR(20) DEFAULT 'enterprise' NOT NULL CHECK (
        "naming_mode" IN ('enterprise', 'personal')
    ),
    "owner_id" uuid NOT NULL,                         -- User who owns this tenant
    "host" VARCHAR(255) DEFAULT 'localhost',          -- Database host (future multi-host support)
    "is_active" BOOLEAN DEFAULT true NOT NULL,        -- Enable/disable tenant access
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TIMESTAMP,                           -- Soft delete timestamp
    "deleted_at" TIMESTAMP,                           -- Hard delete timestamp
    "access_read" uuid[] DEFAULT '{}'::uuid[],        -- ACL read access
    "access_edit" uuid[] DEFAULT '{}'::uuid[],        -- ACL edit access
    "access_full" uuid[] DEFAULT '{}'::uuid[],        -- ACL full access
    "access_deny" uuid[] DEFAULT '{}'::uuid[],        -- ACL deny access
    CONSTRAINT "tenants_database_prefix" CHECK ("database" LIKE 'tenant_%')
);

CREATE INDEX "idx_tenants_name_active" ON "tenants" ("name", "is_active");
CREATE INDEX "idx_tenants_database" ON "tenants" ("database");
CREATE INDEX "idx_tenants_owner" ON "tenants" ("owner_id");
CREATE INDEX "idx_tenants_source_template" ON "tenants" ("source_template");
CREATE INDEX "idx_tenants_template_version" ON "tenants" ("template_version");
CREATE INDEX "idx_tenants_trashed" ON "tenants" ("trashed_at") WHERE "trashed_at" IS NOT NULL;
CREATE INDEX "idx_tenants_deleted" ON "tenants" ("deleted_at") WHERE "deleted_at" IS NOT NULL;

COMMENT ON TABLE "tenants" IS 'Production tenant databases for users and organizations';
COMMENT ON COLUMN "tenants"."name" IS 'Unique tenant identifier used in authentication';
COMMENT ON COLUMN "tenants"."database" IS 'PostgreSQL database name (format: tenant_{hash} or tenant_{name})';
COMMENT ON COLUMN "tenants"."template_version" IS 'Template schema version this tenant was created with';
COMMENT ON COLUMN "tenants"."source_template" IS 'Template used to create this tenant';
COMMENT ON COLUMN "tenants"."naming_mode" IS 'Database naming: enterprise (SHA256 hash) or personal (custom name)';
COMMENT ON COLUMN "tenants"."owner_id" IS 'UUID of user who owns this tenant';
COMMENT ON COLUMN "tenants"."is_active" IS 'Whether tenant is enabled for authentication';

-- ============================================================================
-- SANDBOXES TABLE
-- Temporary/experimental databases for testing and development
-- ============================================================================
CREATE TABLE IF NOT EXISTS "sandboxes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" VARCHAR(255) NOT NULL UNIQUE,              -- Sandbox identifier
    "database" VARCHAR(255) NOT NULL UNIQUE,          -- Database name: sandbox_{random}
    "description" TEXT,                               -- Optional description
    "purpose" TEXT,                                   -- Why this sandbox exists
    "parent_tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,  -- If cloned from tenant
    "parent_template" VARCHAR(255),                   -- If created from template
    "created_by" uuid NOT NULL,                       -- User who created sandbox
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expires_at" TIMESTAMP,                           -- Auto-delete after this time (TODO)
    "last_accessed_at" TIMESTAMP,                     -- Track usage for cleanup
    "is_active" BOOLEAN DEFAULT true NOT NULL,        -- Enable/disable access
    CONSTRAINT "sandboxes_database_prefix" CHECK ("database" LIKE 'sandbox_%')
);

CREATE INDEX "idx_sandboxes_parent_tenant" ON "sandboxes" ("parent_tenant_id");
CREATE INDEX "idx_sandboxes_parent_template" ON "sandboxes" ("parent_template");
CREATE INDEX "idx_sandboxes_created_by" ON "sandboxes" ("created_by");
CREATE INDEX "idx_sandboxes_expires" ON "sandboxes" ("expires_at") WHERE "expires_at" IS NOT NULL;
CREATE INDEX "idx_sandboxes_active" ON "sandboxes" ("is_active");

COMMENT ON TABLE "sandboxes" IS 'Temporary databases for testing and development';
COMMENT ON COLUMN "sandboxes"."name" IS 'Sandbox identifier for authentication';
COMMENT ON COLUMN "sandboxes"."database" IS 'PostgreSQL database name (format: sandbox_{random})';
COMMENT ON COLUMN "sandboxes"."purpose" IS 'Why this sandbox exists (testing, development, etc.)';
COMMENT ON COLUMN "sandboxes"."parent_tenant_id" IS 'Source tenant if cloned from production tenant';
COMMENT ON COLUMN "sandboxes"."parent_template" IS 'Source template if created from template';
COMMENT ON COLUMN "sandboxes"."expires_at" IS 'Auto-deletion time (TODO: implement cleanup job)';
COMMENT ON COLUMN "sandboxes"."last_accessed_at" IS 'Last access time for usage tracking';

-- ============================================================================
-- SNAPSHOTS TABLE - MOVED TO TENANT DATABASES
-- ============================================================================
-- Snapshots are now stored in each tenant database for:
-- - Observer pipeline integration (async background processing)
-- - Tenant-scoped ACLs and validation
-- - Automatic cleanup when tenant is deleted
-- - Consistent with Monk's tenant-scoped architecture
--
-- See fixtures/system/describe/snapshots.sql for snapshot table definition
--
-- ============================================================================
-- REQUEST TRACKING TABLE
-- Records all API requests for analytics, monitoring, and health checking
-- ============================================================================
CREATE TABLE IF NOT EXISTS "requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "method" VARCHAR(10) NOT NULL,                    -- GET, POST, PUT, DELETE
    "url" TEXT NOT NULL,                              -- Full request URL
    "path" TEXT NOT NULL,                             -- URL path (/api/data/users)
    "api" VARCHAR(20),                                -- Extracted API (auth, data, describe, file)
    "ip_address" INET,                                -- Client IP
    "user_agent" TEXT,                                -- Client info
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "idx_requests_timestamp" ON "requests" ("timestamp");
CREATE INDEX "idx_requests_api" ON "requests" ("api");

COMMENT ON TABLE "requests" IS 'API request tracking for analytics, monitoring, and connection health verification';
COMMENT ON COLUMN "requests"."api" IS 'Extracted API category from path (auth, data, describe, file, bulk, find, docs, root)';
COMMENT ON COLUMN "requests"."ip_address" IS 'Client IP address from headers or connection';
COMMENT ON COLUMN "requests"."user_agent" IS 'HTTP User-Agent header for client identification';

-- ============================================================================
-- TRIGGERS
-- Automatic timestamp updates and validation
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to templates table
CREATE TRIGGER "update_templates_updated_at"
    BEFORE UPDATE ON "templates"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply to tenants table
CREATE TRIGGER "update_tenants_updated_at"
    BEFORE UPDATE ON "tenants"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply to sandboxes table
CREATE TRIGGER "update_sandboxes_updated_at"
    BEFORE UPDATE ON "sandboxes"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply to requests table
CREATE TRIGGER "update_requests_updated_at"
    BEFORE UPDATE ON "requests"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
    template_count INTEGER;
    tenant_count INTEGER;
    sandbox_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO template_count FROM "templates";
    SELECT COUNT(*) INTO tenant_count FROM "tenants";
    SELECT COUNT(*) INTO sandbox_count FROM "sandboxes";

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Monk Infrastructure Database Ready';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Templates:  %', template_count;
    RAISE NOTICE 'Tenants:    %', tenant_count;
    RAISE NOTICE 'Sandboxes:  %', sandbox_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
END $$;

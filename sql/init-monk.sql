-- Monk API Database Initialization Script
-- This script creates the required tables for the monk database
--
-- Usage:
--   createdb monk
--   psql -d monk -f sql/init-monk.sql
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

COMMENT ON TABLE "templates" IS 'Immutable database templates for cloning tenants and sandboxes';
COMMENT ON COLUMN "templates"."name" IS 'Template identifier used in API (e.g., default, testing, demo)';
COMMENT ON COLUMN "templates"."database" IS 'PostgreSQL database name (format: monk_template_{name})';
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
CREATE INDEX "idx_tenants_trashed" ON "tenants" ("trashed_at") WHERE "trashed_at" IS NOT NULL;
CREATE INDEX "idx_tenants_deleted" ON "tenants" ("deleted_at") WHERE "deleted_at" IS NOT NULL;

COMMENT ON TABLE "tenants" IS 'Production tenant databases for users and organizations';
COMMENT ON COLUMN "tenants"."name" IS 'Unique tenant identifier used in authentication';
COMMENT ON COLUMN "tenants"."database" IS 'PostgreSQL database name (format: tenant_{hash} or tenant_{name})';
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
    CONSTRAINT "sandboxes_database_prefix" CHECK ("database" LIKE 'sandbox_%'),
    CONSTRAINT "sandboxes_one_parent" CHECK (
        ("parent_tenant_id" IS NOT NULL AND "parent_template" IS NULL) OR
        ("parent_tenant_id" IS NULL AND "parent_template" IS NOT NULL)
    )
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
-- SNAPSHOTS TABLE
-- Point-in-time backups of tenant databases
-- ============================================================================
CREATE TABLE IF NOT EXISTS "snapshots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" VARCHAR(255) NOT NULL UNIQUE,              -- Snapshot identifier
    "database" VARCHAR(255) NOT NULL UNIQUE,          -- Database name: snapshot_{timestamp}_{name}
    "description" TEXT,                               -- Optional description
    "snapshot_type" VARCHAR(20) DEFAULT 'manual' NOT NULL CHECK (
        "snapshot_type" IN ('manual', 'auto', 'pre_migration', 'scheduled')
    ),
    "source_tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
    "source_tenant_name" VARCHAR(255) NOT NULL,       -- Preserved even if tenant deleted
    "size_bytes" BIGINT,                              -- Snapshot size in bytes
    "record_count" INTEGER,                           -- Total records at snapshot time
    "created_by" uuid NOT NULL,                       -- User who created snapshot
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expires_at" TIMESTAMP,                           -- Retention policy expiration
    CONSTRAINT "snapshots_database_prefix" CHECK ("database" LIKE 'snapshot_%')
);

CREATE INDEX "idx_snapshots_source_tenant" ON "snapshots" ("source_tenant_id");
CREATE INDEX "idx_snapshots_source_name" ON "snapshots" ("source_tenant_name");
CREATE INDEX "idx_snapshots_created_by" ON "snapshots" ("created_by");
CREATE INDEX "idx_snapshots_created_at" ON "snapshots" ("created_at");
CREATE INDEX "idx_snapshots_type" ON "snapshots" ("snapshot_type");
CREATE INDEX "idx_snapshots_expires" ON "snapshots" ("expires_at") WHERE "expires_at" IS NOT NULL;

COMMENT ON TABLE "snapshots" IS 'Point-in-time backups of tenant databases';
COMMENT ON COLUMN "snapshots"."name" IS 'Snapshot identifier';
COMMENT ON COLUMN "snapshots"."database" IS 'PostgreSQL database name (format: snapshot_{timestamp}_{name})';
COMMENT ON COLUMN "snapshots"."snapshot_type" IS 'Type: manual, auto, pre_migration, scheduled';
COMMENT ON COLUMN "snapshots"."source_tenant_id" IS 'Source tenant (NULL if deleted)';
COMMENT ON COLUMN "snapshots"."source_tenant_name" IS 'Source tenant name preserved for reference';
COMMENT ON COLUMN "snapshots"."expires_at" IS 'When snapshot should be deleted per retention policy';

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

-- Apply to tenants table
CREATE TRIGGER "update_tenants_updated_at"
    BEFORE UPDATE ON "tenants"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply to requests table
CREATE TRIGGER "update_requests_updated_at"
    BEFORE UPDATE ON "requests"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION FROM OLD SCHEMA
-- Migrate existing data if old tenants table structure exists
-- ============================================================================

-- Check if we need to migrate from old schema
DO $$
DECLARE
    has_tenant_type BOOLEAN;
    template_count INTEGER;
BEGIN
    -- Check if old tenant_type column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' 
        AND column_name = 'tenant_type'
    ) INTO has_tenant_type;

    IF has_tenant_type THEN
        RAISE NOTICE 'Migrating from old schema with tenant_type discriminator...';

        -- Migrate templates: tenant_type = 'template' → templates table
        INSERT INTO "templates" (
            "id", "name", "database", "description", 
            "is_system", "created_at", 
            "access_read", "access_edit", "access_full"
        )
        SELECT 
            "id",
            "name",
            "database",
            "description",
            true,  -- Mark migrated templates as system
            "created_at",
            "access_read",
            "access_edit",
            "access_full"
        FROM "tenants"
        WHERE "tenant_type" = 'template'
        ON CONFLICT ("name") DO NOTHING;

        GET DIAGNOSTICS template_count = ROW_COUNT;
        RAISE NOTICE 'Migrated % templates to templates table', template_count;

        -- Delete migrated templates from tenants table
        DELETE FROM "tenants" WHERE "tenant_type" = 'template';

        -- Drop old columns from tenants table
        ALTER TABLE "tenants" DROP COLUMN IF EXISTS "tenant_type";
        
        -- Add new required columns if they don't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'owner_id'
        ) THEN
            -- Add owner_id column (use id as owner for migrated tenants)
            ALTER TABLE "tenants" ADD COLUMN "owner_id" uuid;
            UPDATE "tenants" SET "owner_id" = "id" WHERE "owner_id" IS NULL;
            ALTER TABLE "tenants" ALTER COLUMN "owner_id" SET NOT NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'source_template'
        ) THEN
            ALTER TABLE "tenants" ADD COLUMN "source_template" VARCHAR(255);
        END IF;

        -- Add constraints if they don't exist
        BEGIN
            ALTER TABLE "tenants" ADD CONSTRAINT "tenants_database_prefix" 
                CHECK ("database" LIKE 'tenant_%');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;

        -- Update indexes
        DROP INDEX IF EXISTS "idx_tenants_tenant_type";
        CREATE INDEX IF NOT EXISTS "idx_tenants_owner" ON "tenants" ("owner_id");
        CREATE INDEX IF NOT EXISTS "idx_tenants_source_template" ON "tenants" ("source_template");

        RAISE NOTICE 'Migration complete. Old tenant_type column removed.';
    ELSE
        RAISE NOTICE 'Schema is up to date. No migration needed.';
    END IF;
END $$;

-- ============================================================================
-- SEED DATA
-- Create default template registry entry
-- ============================================================================

DO $$
BEGIN
    -- Create default template entry (database will be created by autoinstall)
    INSERT INTO "templates" ("name", "database", "description", "is_system", "schema_count")
    VALUES (
        'default',
        'monk_template_default',
        'Default empty template for new tenants and sandboxes',
        true,
        4  -- schemas, columns, users, history
    )
    ON CONFLICT ("name") DO NOTHING;

    IF FOUND THEN
        RAISE NOTICE 'Created default template entry. Database monk_template_default will be created by autoinstall.';
    ELSE
        RAISE NOTICE 'Default template entry already exists.';
    END IF;
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
    template_count INTEGER;
    tenant_count INTEGER;
    sandbox_count INTEGER;
    snapshot_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO template_count FROM "templates";
    SELECT COUNT(*) INTO tenant_count FROM "tenants";
    SELECT COUNT(*) INTO sandbox_count FROM "sandboxes";
    SELECT COUNT(*) INTO snapshot_count FROM "snapshots";

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Monk Database Initialization Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Templates:  %', template_count;
    RAISE NOTICE 'Tenants:    %', tenant_count;
    RAISE NOTICE 'Sandboxes:  %', sandbox_count;
    RAISE NOTICE 'Snapshots:  %', snapshot_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
END $$;

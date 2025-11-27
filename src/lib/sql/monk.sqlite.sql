-- Infrastructure Schema (SQLite)
-- Manages the tenants registry in the public database

-- Tenant fixtures tracking
CREATE TABLE IF NOT EXISTS "tenant_fixtures" (
    "tenant_id" TEXT NOT NULL,
    "fixture_name" TEXT NOT NULL,
    "deployed_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY ("tenant_id", "fixture_name")
);

CREATE INDEX IF NOT EXISTS "idx_tenant_fixtures_tenant" ON "tenant_fixtures" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_fixtures_fixture" ON "tenant_fixtures" ("fixture_name");

-- Tenants registry
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL UNIQUE,
    "db_type" TEXT DEFAULT 'sqlite' NOT NULL CHECK ("db_type" IN ('postgresql', 'sqlite')),
    "database" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "template_version" INTEGER DEFAULT 1 NOT NULL,
    "description" TEXT,
    "source_template" TEXT,
    "owner_id" TEXT NOT NULL,
    "is_active" INTEGER DEFAULT 1 NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TEXT,
    "deleted_at" TEXT,
    CONSTRAINT "tenants_database_schema_unique" UNIQUE("database", "schema")
);

CREATE INDEX IF NOT EXISTS "idx_tenants_name_active" ON "tenants" ("name", "is_active");
CREATE INDEX IF NOT EXISTS "idx_tenants_database" ON "tenants" ("database");
CREATE INDEX IF NOT EXISTS "idx_tenants_owner" ON "tenants" ("owner_id");

-- Tenant Schema (SQLite)
-- Core tables for each tenant namespace: models, fields, users, filters

-- Models table
CREATE TABLE IF NOT EXISTS "models" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "access_read" TEXT DEFAULT '[]',
    "access_edit" TEXT DEFAULT '[]',
    "access_full" TEXT DEFAULT '[]',
    "access_deny" TEXT DEFAULT '[]',
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TEXT,
    "deleted_at" TEXT,
    "model_name" TEXT NOT NULL,
    "status" TEXT DEFAULT 'active' NOT NULL,
    "description" TEXT,
    "sudo" INTEGER DEFAULT 0 NOT NULL,
    "frozen" INTEGER DEFAULT 0 NOT NULL,
    "immutable" INTEGER DEFAULT 0 NOT NULL,
    "external" INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT "model_name_unique" UNIQUE("model_name")
);

-- Fields table
CREATE TABLE IF NOT EXISTS "fields" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "access_read" TEXT DEFAULT '[]',
    "access_edit" TEXT DEFAULT '[]',
    "access_full" TEXT DEFAULT '[]',
    "access_deny" TEXT DEFAULT '[]',
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TEXT,
    "deleted_at" TEXT,
    "model_name" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN (
        'text', 'integer', 'bigint', 'bigserial', 'numeric', 'boolean',
        'jsonb', 'uuid', 'timestamp', 'date',
        'text[]', 'integer[]', 'numeric[]', 'uuid[]'
    )),
    "required" INTEGER DEFAULT 0 NOT NULL,
    "default_value" TEXT,
    "description" TEXT,
    "relationship_type" TEXT,
    "related_model" TEXT,
    "related_field" TEXT,
    "relationship_name" TEXT,
    "cascade_delete" INTEGER DEFAULT 0,
    "required_relationship" INTEGER DEFAULT 0,
    "minimum" REAL,
    "maximum" REAL,
    "pattern" TEXT,
    "enum_values" TEXT,
    "is_array" INTEGER DEFAULT 0,
    "immutable" INTEGER DEFAULT 0 NOT NULL,
    "sudo" INTEGER DEFAULT 0 NOT NULL,
    "unique" INTEGER DEFAULT 0 NOT NULL,
    "index" INTEGER DEFAULT 0 NOT NULL,
    "tracked" INTEGER DEFAULT 0 NOT NULL,
    "searchable" INTEGER DEFAULT 0 NOT NULL,
    "transform" TEXT,
    FOREIGN KEY ("model_name") REFERENCES "models"("model_name")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_fields_model_field" ON "fields" ("model_name", "field_name");

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "access" TEXT CHECK ("access" IN ('root', 'full', 'edit', 'read', 'deny')) NOT NULL,
    "access_read" TEXT DEFAULT '[]',
    "access_edit" TEXT DEFAULT '[]',
    "access_full" TEXT DEFAULT '[]',
    "access_deny" TEXT DEFAULT '[]',
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TEXT,
    "deleted_at" TEXT,
    CONSTRAINT "users_auth_unique" UNIQUE("auth")
);

-- Filters table
CREATE TABLE IF NOT EXISTS "filters" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "access_read" TEXT DEFAULT '[]',
    "access_edit" TEXT DEFAULT '[]',
    "access_full" TEXT DEFAULT '[]',
    "access_deny" TEXT DEFAULT '[]',
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TEXT,
    "deleted_at" TEXT,
    "name" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "description" TEXT,
    "select" TEXT,
    "where" TEXT,
    "order" TEXT,
    "limit" INTEGER,
    "offset" INTEGER,
    FOREIGN KEY ("model_name") REFERENCES "models"("model_name") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_filters_model_name" ON "filters" ("model_name", "name");

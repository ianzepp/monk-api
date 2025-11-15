-- Monk API Required Schema Tables
-- These tables are required for the Hono API to function correctly

-- Enable pgcrypto extension for checksum generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum type for column data types
CREATE TYPE column_type AS ENUM (
    'text',
    'integer',
    'numeric',
    'boolean',
    'jsonb',
    'uuid',
    'timestamp',
    'date',
    'text[]',
    'integer[]',
    'numeric[]',
    'uuid[]'
);

-- Schema registry table to store schema metadata
CREATE TABLE "schemas" (
    -- System
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,

	-- Implementation
	"schema_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,

	-- Constraints
	CONSTRAINT "schema_name_unique" UNIQUE("schema_name")
);

-- Column registry table to store individual field metadata
CREATE TABLE "columns" (
    -- System
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,

	-- Implementation
	"schema_name" text NOT NULL,
	"column_name" text NOT NULL,
	"type" column_type NOT NULL,
	"required" text DEFAULT 'false' NOT NULL,
	"default_value" text,
	"description" text,

	-- Relationships
	"relationship_type" text,
	"related_schema" text,
	"related_column" text,
	"relationship_name" text,
	"cascade_delete" boolean DEFAULT false,
	"required_relationship" boolean DEFAULT false,

	-- Restrictions
	"minimum" numeric,
	"maximum" numeric,
	"pattern" text,
	"enum_values" text[],
	"is_array" boolean DEFAULT false
);

-- Add foreign key constraint
ALTER TABLE "columns" ADD CONSTRAINT "columns_schemas_name_schema_name_fk"
    FOREIGN KEY ("schema_name") REFERENCES "public"."schemas"("schema_name")
    ON DELETE no action ON UPDATE no action;

-- Add unique index for schema+column combination
CREATE UNIQUE INDEX "idx_columns_schema_column"
    ON "columns" ("schema_name", "column_name");

-- Users table to store tenant users and their access levels (1-db-per-tenant)
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"auth" text NOT NULL,
	"access" text CHECK ("access" IN ('root', 'full', 'edit', 'read', 'deny')) NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "users_auth_unique" UNIQUE("auth")
);

-- Insert self-reference row to enable recursive schema discovery via data API
-- This allows GET /api/data/schemas to work by querying the schemas table itself
INSERT INTO "schemas" (schema_name, status)
VALUES (
    'schemas',
    'system'
);

-- Insert self-reference row to enable recursive schema discovery via data API
-- This allows GET /api/data/columns to work by querying the columns table itself
INSERT INTO "schemas" (schema_name, status)
VALUES (
    'columns',
    'system'
);

-- Insert user schema registration to enable user API access
-- This allows GET /api/data/users to work
INSERT INTO "schemas" (schema_name, status)
VALUES (
    'users',
    'system'
);

-- Monk API Required Schema Tables
-- These tables are required for the Hono API to function correctly

-- Schema registry table to store JSON Schema definitions
CREATE TABLE "schema" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,
	"name" text NOT NULL,
	"table_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"definition" jsonb NOT NULL,
	"field_count" text NOT NULL,
	"yaml_checksum" text,
	CONSTRAINT "schema_name_unique" UNIQUE("name"),
	CONSTRAINT "schema_table_name_unique" UNIQUE("table_name")
);

-- Column registry table to store individual field metadata  
CREATE TABLE "columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,
	"schema_name" text NOT NULL,
	"column_name" text NOT NULL,
	"pg_type" text NOT NULL,
	"is_required" text DEFAULT 'false' NOT NULL,
	"default_value" text,
	"constraints" jsonb,
	"foreign_key" jsonb,
	"description" text
);

-- Add foreign key constraint
ALTER TABLE "columns" ADD CONSTRAINT "columns_schema_name_schema_name_fk" 
    FOREIGN KEY ("schema_name") REFERENCES "public"."schema"("name") 
    ON DELETE no action ON UPDATE no action;

-- Users table to store tenant users and their access levels
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_name" text NOT NULL,
	"name" text NOT NULL,
	"access" text CHECK ("access" IN ('root', 'full', 'edit', 'read', 'deny')) NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "users_tenant_name_name_unique" UNIQUE("tenant_name", "name")
);

-- Ping logging table to record all ping requests
CREATE TABLE "pings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp DEFAULT now() NOT NULL,
    "client_ip" inet,
    "user_agent" text,
    "request_id" text,
    "response_time_ms" integer,
    "jwt_domain" text,
    "jwt_user_id" uuid,
    "jwt_access" text,
    "server_version" text,
    "database_status" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Insert self-reference row to enable recursive schema discovery via data API
-- This allows GET /api/data/schema to work by querying the schema table itself
INSERT INTO "schema" (name, table_name, status, definition, field_count, yaml_checksum)
VALUES (
    'schema',
    'schema', 
    'system',
    '{
        "type": "object",
        "title": "Schema",
        "description": "Schema registry table for meta API schema definitions",
        "properties": {
            "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100,
                "description": "Unique schema name",
                "example": "account"
            },
            "table_name": {
                "type": "string", 
                "minLength": 1,
                "maxLength": 100,
                "description": "Database table name",
                "example": "accounts"
            },
            "status": {
                "type": "string",
                "enum": ["pending", "active", "disabled", "system"],
                "default": "pending",
                "description": "Schema status"
            },
            "definition": {
                "type": "object",
                "description": "JSON Schema definition object",
                "additionalProperties": true
            },
            "field_count": {
                "type": "string",
                "pattern": "^[0-9]+$", 
                "description": "Number of fields in schema",
                "example": "5"
            },
            "yaml_checksum": {
                "type": "string",
                "pattern": "^[a-f0-9]{64}$",
                "description": "SHA256 checksum of original YAML",
                "example": "a1b2c3d4..."
            },
            "domain": {
                "type": "string",
                "description": "Domain context (nullable)"
            }
        },
        "required": ["name", "table_name", "status", "definition", "field_count"],
        "additionalProperties": false
    }',
    '7',
    null
);
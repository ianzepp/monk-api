-- Monk API Required Schema Tables
-- These tables are required for the Hono API to function correctly
-- Based on drizzle schema from monk-api-hono/drizzle/0000_powerful_punisher.sql

-- Schema registry table to store JSON Schema definitions
CREATE TABLE "schemas" (
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
	CONSTRAINT "schemas_name_unique" UNIQUE("name"),
	CONSTRAINT "schemas_table_name_unique" UNIQUE("table_name")
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
ALTER TABLE "columns" ADD CONSTRAINT "columns_schema_name_schemas_name_fk" 
    FOREIGN KEY ("schema_name") REFERENCES "public"."schemas"("name") 
    ON DELETE no action ON UPDATE no action;
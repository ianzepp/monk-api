-- ============================================================================
-- SCHEMA: columns
-- ============================================================================
-- Column registry table to store individual field metadata

CREATE TABLE "columns" (
    -- System fields
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trashed_at" timestamp,
	"deleted_at" timestamp,

	-- Column metadata
	"schema_name" text NOT NULL,
	"column_name" text NOT NULL,
	"type" column_type NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
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
	"is_array" boolean DEFAULT false,
	"immutable" boolean DEFAULT false NOT NULL,
	"sudo" boolean DEFAULT false NOT NULL,
	"unique" boolean DEFAULT false NOT NULL,
	"index" boolean DEFAULT false NOT NULL,
	"tracked" boolean DEFAULT false NOT NULL,

	-- Search and Transform
	"searchable" boolean DEFAULT false NOT NULL,
	"transform" text
);

-- Foreign key: columns belong to schemas
ALTER TABLE "columns" ADD CONSTRAINT "columns_schemas_name_schema_name_fk"
    FOREIGN KEY ("schema_name") REFERENCES "public"."schemas"("schema_name")
    ON DELETE no action ON UPDATE no action;

-- Unique index for schema+column combination
CREATE UNIQUE INDEX "idx_columns_schema_column"
    ON "columns" ("schema_name", "column_name");

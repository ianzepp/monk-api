-- ============================================================================
-- MODEL: fields
-- ============================================================================
-- Field registry table to store individual field metadata

CREATE TABLE "fields" (
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

	-- Field metadata
	"model_name" text NOT NULL,
	"field_name" text NOT NULL,
	"type" field_type NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"description" text,

	-- Relationships
	"relationship_type" text,
	"related_model" text,
	"related_field" text,
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

-- Foreign key: fields belong to models
ALTER TABLE "fields" ADD CONSTRAINT "fields_models_name_model_name_fk"
    FOREIGN KEY ("model_name") REFERENCES "models"("model_name")
    ON DELETE no action ON UPDATE no action;

-- Unique index for model+field combination
CREATE UNIQUE INDEX "idx_fields_model_field"
    ON "fields" ("model_name", "field_name");

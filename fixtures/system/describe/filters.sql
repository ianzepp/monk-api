-- ============================================================================
-- MODEL: filters
-- ============================================================================
-- Saved filter definitions for the Find API

CREATE TABLE "filters" (
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

	-- Filter identification
	"name" text NOT NULL,
	"model_name" text NOT NULL,
	"description" text,

	-- Query components (matching Find API body structure)
	"select" jsonb,
	"where" jsonb,
	"order" jsonb,
	"limit" integer,
	"offset" integer
);

-- Name must be unique within each model
CREATE UNIQUE INDEX "idx_filters_model_name"
	ON "filters" ("model_name", "name");

-- Foreign key: filters reference models
ALTER TABLE "filters" ADD CONSTRAINT "filters_models_model_name_fk"
	FOREIGN KEY ("model_name") REFERENCES "models"("model_name")
	ON DELETE CASCADE ON UPDATE CASCADE;

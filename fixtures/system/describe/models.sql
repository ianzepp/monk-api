-- ============================================================================
-- MODEL: models
-- ============================================================================
-- Model registry table to store model metadata

CREATE TABLE "models" (
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

	-- Model metadata
	"model_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text,
	"sudo" boolean DEFAULT false NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"immutable" boolean DEFAULT false NOT NULL,
	"external" boolean DEFAULT false NOT NULL,

	-- Constraints
	CONSTRAINT "model_name_unique" UNIQUE("model_name")
);

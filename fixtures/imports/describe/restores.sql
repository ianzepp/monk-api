-- ============================================================================
-- MODEL: restores
-- ============================================================================
-- Restore/import job configurations

CREATE TABLE "restores" (
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

	-- Configuration
	"name" text NOT NULL,
	"description" text,
	"source_type" text DEFAULT 'upload' NOT NULL CHECK ("source_type" IN ('upload', 'extract_run', 'url')),
	"source_ref" text,
	"conflict_strategy" text DEFAULT 'upsert' NOT NULL CHECK ("conflict_strategy" IN ('replace', 'upsert', 'merge', 'sync', 'skip', 'error')),
	"include" text[] DEFAULT ARRAY['describe', 'data']::text[],
	"models" text[],
	"create_models" boolean DEFAULT true,
	"enabled" boolean DEFAULT true,

	-- Stats (denormalized)
	"last_run_id" uuid,
	"last_run_at" timestamp,
	"total_runs" integer DEFAULT 0,
	"successful_runs" integer DEFAULT 0,
	"failed_runs" integer DEFAULT 0
);

CREATE INDEX "idx_restores_enabled" ON "restores" ("enabled");
CREATE INDEX "idx_restores_source_type" ON "restores" ("source_type");

-- ============================================================================
-- SCHEMA: extracts
-- ============================================================================
-- Data extraction job configurations

CREATE TABLE "extracts" (
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

	-- Extract configuration
	"name" text NOT NULL,
	"description" text,
	"format" text DEFAULT 'jsonl' NOT NULL CHECK ("format" IN ('yaml', 'json', 'jsonl', 'archive')),
	"include" text[] DEFAULT ARRAY['describe', 'data']::text[],
	"schemas" text[],
	"filter" jsonb,
	"compress" boolean DEFAULT true,
	"split_files" boolean DEFAULT false,

	-- Scheduling
	"schedule" text,
	"schedule_enabled" boolean DEFAULT false,
	"retention_days" integer DEFAULT 7,
	"enabled" boolean DEFAULT true,

	-- Stats (denormalized)
	"last_run_id" uuid,
	"last_run_status" text,
	"last_run_at" timestamp,
	"total_runs" integer DEFAULT 0,
	"successful_runs" integer DEFAULT 0,
	"failed_runs" integer DEFAULT 0
);

CREATE INDEX "idx_extracts_enabled" ON "extracts" ("enabled");
CREATE INDEX "idx_extracts_schedule_enabled" ON "extracts" ("schedule_enabled") WHERE "schedule_enabled" = true;

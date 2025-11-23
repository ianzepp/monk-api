-- ============================================================================
-- MODEL: extract_runs
-- ============================================================================
-- Individual execution runs of extract jobs

CREATE TABLE "extract_runs" (
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

	-- Relationship
	"extract_id" uuid NOT NULL,
	"extract_name" text,

	-- Execution state
	"status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
	"progress" integer DEFAULT 0 CHECK ("progress" BETWEEN 0 AND 100),
	"progress_detail" jsonb,

	-- Timing
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_seconds" integer,

	-- Results
	"records_exported" integer DEFAULT 0,
	"models_exported" integer DEFAULT 0,
	"artifacts_created" integer DEFAULT 0,
	"total_size_bytes" bigint DEFAULT 0,

	-- Error handling
	"error" text,
	"error_detail" jsonb,

	-- Execution context
	"executed_by" uuid,
	"triggered_by" text DEFAULT 'manual' CHECK ("triggered_by" IN ('manual', 'schedule', 'api')),
	"config_snapshot" jsonb
);

-- Foreign key
ALTER TABLE "extract_runs" ADD CONSTRAINT "extract_runs_extract_id_fk"
    FOREIGN KEY ("extract_id") REFERENCES "public"."extracts"("id")
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_extract_runs_extract_id" ON "extract_runs" ("extract_id");
CREATE INDEX "idx_extract_runs_status" ON "extract_runs" ("status");
CREATE INDEX "idx_extract_runs_created_at" ON "extract_runs" ("created_at" DESC);

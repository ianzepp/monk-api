-- ============================================================================
-- MODEL: restore_runs
-- ============================================================================
-- Individual execution runs of restore jobs

CREATE TABLE "restore_runs" (
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
	"restore_id" uuid NOT NULL,
	"restore_name" text,
	"source_filename" text,

	-- Execution state
	"status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
	"progress" integer DEFAULT 0 CHECK ("progress" BETWEEN 0 AND 100),
	"progress_detail" jsonb,

	-- Timing
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_seconds" integer,

	-- Results
	"records_imported" integer DEFAULT 0,
	"records_skipped" integer DEFAULT 0,
	"records_updated" integer DEFAULT 0,
	"models_created" integer DEFAULT 0,
	"fields_created" integer DEFAULT 0,

	-- Error handling
	"error" text,
	"error_detail" text,

	-- Configuration snapshot
	"config_snapshot" jsonb
);

-- Foreign key
ALTER TABLE "restore_runs" ADD CONSTRAINT "restore_runs_restore_id_fk"
    FOREIGN KEY ("restore_id") REFERENCES "restores"("id")
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_restore_runs_restore_id" ON "restore_runs" ("restore_id");
CREATE INDEX "idx_restore_runs_status" ON "restore_runs" ("status");
CREATE INDEX "idx_restore_runs_created_at" ON "restore_runs" ("created_at" DESC);

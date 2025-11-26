-- ============================================================================
-- MODEL: restore_logs
-- ============================================================================
-- Detailed logging for restore operations (info, warnings, errors)

CREATE TABLE "restore_logs" (
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
	"run_id" uuid NOT NULL,

	-- Log entry
	"level" text NOT NULL CHECK ("level" IN ('info', 'warn', 'error')),
	"phase" text CHECK ("phase" IS NULL OR "phase" IN ('upload', 'validation', 'describe_import', 'data_import')),
	"model_name" text,
	"record_id" text,
	"message" text NOT NULL,
	"detail" jsonb
);

-- Foreign key
ALTER TABLE "restore_logs" ADD CONSTRAINT "restore_logs_run_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "restore_runs"("id")
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_restore_logs_run_id" ON "restore_logs" ("run_id");
CREATE INDEX "idx_restore_logs_level" ON "restore_logs" ("level");
CREATE INDEX "idx_restore_logs_created_at" ON "restore_logs" ("created_at" DESC);

-- Restore Run Execution Tracking
-- Tracks individual restore job executions with progress and results

CREATE TABLE "restore_runs" (
    -- System fields
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "access_public" boolean DEFAULT false NOT NULL,
    "access_tenants" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "access_users" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" uuid,
    "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" uuid,
    "deleted_at" timestamp,
    "deleted_by" uuid,

    -- Restore reference
    "restore_id" uuid,
    "restore_name" text,
    "source_filename" text,

    -- Execution status
    "status" text DEFAULT 'pending' NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "progress_detail" jsonb,
    "started_at" timestamp,
    "completed_at" timestamp,
    "duration_seconds" integer,

    -- Results
    "records_imported" integer DEFAULT 0 NOT NULL,
    "records_skipped" integer DEFAULT 0 NOT NULL,
    "records_updated" integer DEFAULT 0 NOT NULL,
    "models_created" integer DEFAULT 0 NOT NULL,
    "fields_created" integer DEFAULT 0 NOT NULL,

    -- Error tracking
    "error" text,
    "error_detail" text,

    -- Configuration snapshot
    "config_snapshot" jsonb,

    CONSTRAINT "restore_runs_status_check" CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT "restore_runs_progress_check" CHECK (progress >= 0 AND progress <= 100)
);

-- Indexes
CREATE INDEX "restore_runs_restore_id_idx" ON "restore_runs"("restore_id");
CREATE INDEX "restore_runs_status_idx" ON "restore_runs"("status");
CREATE INDEX "restore_runs_created_at_idx" ON "restore_runs"("created_at");
CREATE INDEX "restore_runs_started_at_idx" ON "restore_runs"("started_at");

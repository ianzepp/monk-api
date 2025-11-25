-- Restore Log Entries
-- Detailed logging for restore operations (info, warnings, errors)

CREATE TABLE "restore_logs" (
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

    -- Log entry
    "run_id" uuid NOT NULL,
    "level" text NOT NULL,
    "phase" text,
    "model_name" text,
    "record_id" text,
    "message" text NOT NULL,
    "detail" jsonb,

    CONSTRAINT "restore_logs_level_check" CHECK (level IN ('info', 'warn', 'error')),
    CONSTRAINT "restore_logs_phase_check" CHECK (phase IS NULL OR phase IN ('upload', 'validation', 'describe_import', 'data_import'))
);

-- Indexes
CREATE INDEX "restore_logs_run_id_idx" ON "restore_logs"("run_id");
CREATE INDEX "restore_logs_level_idx" ON "restore_logs"("level");
CREATE INDEX "restore_logs_created_at_idx" ON "restore_logs"("created_at");
CREATE INDEX "restore_logs_model_name_idx" ON "restore_logs"("model_name");

-- Restore Configuration Table
-- Defines restore/import jobs with source and conflict resolution strategies

CREATE TABLE "restores" (
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

    -- Configuration
    "name" text NOT NULL,
    "description" text,
    "source_type" text DEFAULT 'upload' NOT NULL,
    "source_ref" text,
    "conflict_strategy" text DEFAULT 'upsert' NOT NULL,
    "include" text[] DEFAULT ARRAY['describe', 'data']::text[] NOT NULL,
    "schemas" text[],
    "create_schemas" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,

    -- Statistics
    "last_run_id" uuid,
    "last_run_at" timestamp,
    "total_runs" integer DEFAULT 0 NOT NULL,
    "successful_runs" integer DEFAULT 0 NOT NULL,
    "failed_runs" integer DEFAULT 0 NOT NULL,

    CONSTRAINT "restores_source_type_check" CHECK (source_type IN ('upload', 'extract_run', 'url')),
    CONSTRAINT "restores_conflict_strategy_check" CHECK (conflict_strategy IN ('replace', 'upsert', 'merge', 'sync', 'skip', 'error'))
);

-- Indexes
CREATE INDEX "restores_enabled_idx" ON "restores"("enabled");
CREATE INDEX "restores_source_type_idx" ON "restores"("source_type");
CREATE INDEX "restores_last_run_at_idx" ON "restores"("last_run_at");

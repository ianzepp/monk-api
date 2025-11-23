-- ============================================================================
-- MODEL: snapshots
-- ============================================================================
-- Snapshots table for point-in-time full database backups (pg_dump based)

CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" VARCHAR(255) NOT NULL UNIQUE,
	"database" VARCHAR(255) NOT NULL UNIQUE,
	"description" TEXT,
	"status" VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (
		"status" IN ('pending', 'processing', 'active', 'failed')
	),
	"snapshot_type" VARCHAR(20) DEFAULT 'manual' NOT NULL CHECK (
		"snapshot_type" IN ('manual', 'auto', 'pre_migration', 'scheduled')
	),
	"size_bytes" BIGINT,
	"record_count" INTEGER,
	"error_message" TEXT,
	"created_by" uuid NOT NULL,
	"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" TIMESTAMP,
	"trashed_at" TIMESTAMP,
	"deleted_at" TIMESTAMP,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	CONSTRAINT "snapshots_database_prefix" CHECK ("database" LIKE 'snapshot_%')
);

-- Indexes for efficient querying
CREATE INDEX "idx_snapshots_status" ON "snapshots" ("status");
CREATE INDEX "idx_snapshots_type" ON "snapshots" ("snapshot_type");
CREATE INDEX "idx_snapshots_created_by" ON "snapshots" ("created_by");
CREATE INDEX "idx_snapshots_created_at" ON "snapshots" ("created_at");
CREATE INDEX "idx_snapshots_expires" ON "snapshots" ("expires_at") WHERE "expires_at" IS NOT NULL;
CREATE INDEX "idx_snapshots_trashed" ON "snapshots" ("trashed_at") WHERE "trashed_at" IS NOT NULL;

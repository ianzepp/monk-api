-- ============================================================================
-- MODEL: history
-- ============================================================================
-- Change tracking and audit trail table

CREATE TABLE "history" (
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

	-- History-specific fields
	"change_id" bigserial NOT NULL,
	"model_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"changes" jsonb NOT NULL,
	"created_by" uuid,
	"request_id" text,
	"metadata" jsonb
);

-- Composite index for efficient history queries
CREATE INDEX idx_history_model_record ON history(model_name, record_id, change_id DESC);

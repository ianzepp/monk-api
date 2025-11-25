-- ============================================================================
-- MODEL: grids
-- ============================================================================
-- Grid metadata storage - regular model managed via Data API

CREATE TABLE "grids" (
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

	-- Grid metadata
	"name" text NOT NULL,
	"description" text,
	"row_count" integer,
	"row_max" integer DEFAULT 1000,
	"col_max" text DEFAULT 'Z'
);

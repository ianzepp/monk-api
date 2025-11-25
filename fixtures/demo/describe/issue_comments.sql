-- ============================================================================
-- MODEL: issue_comments
-- ============================================================================
-- Comments and discussion on issues

CREATE TABLE "issue_comments" (
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

    -- Comment fields
    "issue_id" uuid NOT NULL REFERENCES issues(id),
    "author" text NOT NULL CHECK (char_length(author) <= 100),
    "body" text NOT NULL CHECK (char_length(body) <= 5000)
);

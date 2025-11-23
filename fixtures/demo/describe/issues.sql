-- ============================================================================
-- MODEL: issues
-- ============================================================================
-- Issue tracking and bug reports

CREATE TABLE "issues" (
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

    -- Issue fields
    "repository_id" uuid NOT NULL REFERENCES repositories(id),
    "title" text NOT NULL CHECK (char_length(title) >= 2 AND char_length(title) <= 200),
    "description" text CHECK (description IS NULL OR char_length(description) <= 10000),
    "status" text CHECK (status IS NULL OR status IN ('open', 'in_progress', 'closed', 'wont_fix', 'duplicate')),
    "priority" text CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
    "labels" text[],
    "assignee" text CHECK (assignee IS NULL OR char_length(assignee) <= 100),
    "reported_by" text CHECK (reported_by IS NULL OR char_length(reported_by) <= 100),
    "closed_at" timestamp
);

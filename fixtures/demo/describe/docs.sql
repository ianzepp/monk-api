-- ============================================================================
-- MODEL: docs
-- ============================================================================
-- Large text documentation with full-text search capabilities

CREATE TABLE "docs" (
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

    -- Documentation fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "title" text NOT NULL CHECK (char_length(title) >= 2 AND char_length(title) <= 200),
    "content" text NOT NULL CHECK (char_length(content) <= 100000),
    "content_type" text CHECK (content_type IS NULL OR content_type IN ('markdown', 'plaintext', 'code', 'adr', 'api-spec')),
    "tags" text[],
    "category" text CHECK (category IS NULL OR category IN ('reference', 'guide', 'adr', 'runbook', 'architecture', 'tutorial')),
    "author" text CHECK (author IS NULL OR char_length(author) <= 100),
    "version" text CHECK (version IS NULL OR char_length(version) <= 50),
    "metadata" jsonb,
    "accessed_at" timestamp
);

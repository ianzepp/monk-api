-- ============================================================================
-- MODEL: repositories
-- ============================================================================
-- Code repositories (management layer, not git internals)

CREATE TABLE "repositories" (
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

    -- Repository fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "slug" text NOT NULL CHECK (char_length(slug) <= 100 AND slug ~ '^[a-z0-9-]+$'),
    "description" text CHECK (description IS NULL OR char_length(description) <= 1000),
    "visibility" text CHECK (visibility IS NULL OR visibility IN ('public', 'private', 'internal')),
    "primary_language" text CHECK (primary_language IS NULL OR char_length(primary_language) <= 50),
    "topics" text[],
    "stars" integer CHECK (stars IS NULL OR (stars >= 0 AND stars <= 999999)),

    -- Constraints
    CONSTRAINT "repositories_workspace_slug_unique" UNIQUE(workspace_id, slug)
);

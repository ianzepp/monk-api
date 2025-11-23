-- ============================================================================
-- MODEL: workspaces
-- ============================================================================
-- Top-level organizational containers for multi-tenant simulation

CREATE TABLE "workspaces" (
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

    -- Workspace fields
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "slug" text NOT NULL CHECK (char_length(slug) <= 100 AND slug ~ '^[a-z0-9-]+$'),
    "description" text CHECK (description IS NULL OR char_length(description) <= 500),
    "settings" jsonb,

    -- Constraints
    CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);

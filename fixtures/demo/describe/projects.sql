-- ============================================================================
-- MODEL: projects
-- ============================================================================
-- Projects and initiatives within workspaces

CREATE TABLE "projects" (
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

    -- Project fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "description" text CHECK (description IS NULL OR char_length(description) <= 2000),
    "status" text CHECK (status IS NULL OR status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
    "start_date" date,
    "end_date" date,
    "owner" text CHECK (owner IS NULL OR char_length(owner) <= 100),
    "tags" text[],

    -- Constraints
    CONSTRAINT "projects_workspace_name_unique" UNIQUE(workspace_id, name)
);

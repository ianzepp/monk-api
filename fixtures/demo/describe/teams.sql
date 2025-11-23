-- ============================================================================
-- MODEL: teams
-- ============================================================================
-- Development teams and groups within workspaces

CREATE TABLE "teams" (
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

    -- Team fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "description" text CHECK (description IS NULL OR char_length(description) <= 500),
    "focus_area" text CHECK (focus_area IS NULL OR focus_area IN ('backend', 'frontend', 'ai-ml', 'devops', 'design', 'product', 'data')),

    -- Constraints
    CONSTRAINT "teams_workspace_name_unique" UNIQUE(workspace_id, name)
);

-- ============================================================================
-- MODEL: tasks
-- ============================================================================
-- Tasks, todos, and action items

CREATE TABLE "tasks" (
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

    -- Task fields
    "project_id" uuid REFERENCES projects(id),
    "title" text NOT NULL CHECK (char_length(title) >= 2 AND char_length(title) <= 200),
    "description" text CHECK (description IS NULL OR char_length(description) <= 5000),
    "status" text CHECK (status IS NULL OR status IN ('todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled')),
    "priority" text CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
    "assignee" text CHECK (assignee IS NULL OR char_length(assignee) <= 100),
    "due_date" date,
    "tags" text[],
    "estimated_hours" integer CHECK (estimated_hours IS NULL OR (estimated_hours >= 0 AND estimated_hours <= 1000)),
    "completed_at" timestamp
);

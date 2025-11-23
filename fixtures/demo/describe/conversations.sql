-- ============================================================================
-- MODEL: conversations
-- ============================================================================
-- LLM conversation history with searchable context

CREATE TABLE "conversations" (
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

    -- Conversation fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "title" text NOT NULL CHECK (char_length(title) >= 2 AND char_length(title) <= 200),
    "context_tags" text[],
    "participants" text[],
    "summary" text CHECK (summary IS NULL OR char_length(summary) <= 2000),
    "metadata" jsonb,
    "started_at" timestamp,
    "last_message_at" timestamp
);

-- ============================================================================
-- MODEL: messages
-- ============================================================================
-- Individual messages within conversations

CREATE TABLE "messages" (
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

    -- Message fields
    "conversation_id" uuid NOT NULL REFERENCES conversations(id),
    "role" text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    "content" text NOT NULL CHECK (char_length(content) <= 50000),
    "tokens" integer CHECK (tokens IS NULL OR (tokens >= 0 AND tokens <= 100000)),
    "metadata" jsonb
);

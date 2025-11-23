-- ============================================================================
-- MODEL: contacts
-- ============================================================================
-- Test model for contacts management

CREATE TABLE "contacts" (
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

    -- Contact fields
    "name" text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    "email" text NOT NULL,
    "phone" text CHECK (phone IS NULL OR phone ~ '^\+?[1-9]\d{1,14}$'),
    "company" text CHECK (company IS NULL OR char_length(company) <= 100),
    "status" text DEFAULT 'prospect' CHECK (status IN ('active', 'inactive', 'prospect')),
    "notes" text
);

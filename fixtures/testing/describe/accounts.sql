-- ============================================================================
-- MODEL: accounts
-- ============================================================================
-- Test model for accounts management

CREATE TABLE "accounts" (
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

    -- Account fields
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "email" text NOT NULL CHECK (char_length(email) <= 255),
    "username" text NOT NULL CHECK (username ~ '^[a-zA-Z0-9_-]{3,50}$'),
    "accounts_type" text DEFAULT 'personal' NOT NULL CHECK (accounts_type IN ('personal', 'business', 'trial', 'premium')),
    "balance" numeric DEFAULT 0 CHECK (balance >= 0 AND balance <= 1000000),
    "is_active" boolean DEFAULT true,
    "is_verified" boolean DEFAULT false,
    "credit_limit" numeric CHECK (credit_limit IS NULL OR (credit_limit >= 0 AND credit_limit <= 10000)),
    "last_login" timestamp,
    "preferences" jsonb,
    "metadata" jsonb,
    "phone" text CHECK (phone IS NULL OR phone ~ '^\+?[1-9]\d{1,14}$|^\+?1 \([0-9]{3}\) [0-9]{3}-[0-9]{4}$'),

    -- Constraints
    CONSTRAINT "accounts_username_unique" UNIQUE("username"),
    CONSTRAINT "accounts_email_unique" UNIQUE("email")
);

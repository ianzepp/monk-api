-- ============================================================================
-- MODEL: members
-- ============================================================================
-- Team members and users

CREATE TABLE "members" (
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

    -- Member fields
    "team_id" uuid NOT NULL REFERENCES teams(id),
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "email" text NOT NULL CHECK (char_length(email) <= 255 AND email ~ '^[^@]+@[^@]+\.[^@]+$'),
    "role" text CHECK (role IS NULL OR role IN ('lead', 'senior', 'mid', 'junior', 'intern')),
    "timezone" text CHECK (timezone IS NULL OR char_length(timezone) <= 50),
    "avatar_url" text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
    "joined_at" timestamp
);

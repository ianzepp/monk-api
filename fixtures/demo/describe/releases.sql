-- ============================================================================
-- MODEL: releases
-- ============================================================================
-- Software releases, tags, and versioning

CREATE TABLE "releases" (
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

    -- Release fields
    "repository_id" uuid NOT NULL REFERENCES repositories(id),
    "version" text NOT NULL CHECK (char_length(version) <= 50),
    "name" text CHECK (name IS NULL OR char_length(name) <= 200),
    "description" text CHECK (description IS NULL OR char_length(description) <= 10000),
    "tag" text CHECK (tag IS NULL OR char_length(tag) <= 100),
    "is_prerelease" boolean DEFAULT false,
    "is_draft" boolean DEFAULT false,
    "published_by" text CHECK (published_by IS NULL OR char_length(published_by) <= 100),
    "published_at" timestamp
);

-- Migration: Standardize tenant table to match metabase system columns pattern
-- Adds soft delete support and ACL columns to tenant registry

-- Add UUID primary key (preserve existing name as unique identifier)
ALTER TABLE "tenants" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;

-- Add tenant context (typically null for tenant registry, but maintains pattern)
ALTER TABLE "tenants" ADD COLUMN "tenant" text;

-- Add ACL access control columns
ALTER TABLE "tenants" ADD COLUMN "access_read" uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE "tenants" ADD COLUMN "access_edit" uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE "tenants" ADD COLUMN "access_full" uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE "tenants" ADD COLUMN "access_deny" uuid[] DEFAULT '{}'::uuid[];

-- Add soft delete columns
ALTER TABLE "tenants" ADD COLUMN "trashed_at" timestamp;
ALTER TABLE "tenants" ADD COLUMN "deleted_at" timestamp;

-- Update existing timestamp columns to match pattern (change names)
-- Note: created_at and updated_at already exist, just ensuring they match pattern

-- Create new unique constraint on id
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_id_unique" UNIQUE("id");

-- Update the trigger to handle updated_at properly (already exists, but ensure it works)
-- The trigger update_tenants_updated_at should already exist from init-auth.sql

-- Comments for new columns
COMMENT ON COLUMN "tenants"."id" IS 'Unique UUID identifier following metabase pattern';
COMMENT ON COLUMN "tenants"."tenant" IS 'Tenant context (typically null for tenant registry)';
COMMENT ON COLUMN "tenants"."access_read" IS 'ACL read access control array';
COMMENT ON COLUMN "tenants"."access_edit" IS 'ACL edit access control array';  
COMMENT ON COLUMN "tenants"."access_full" IS 'ACL full access control array';
COMMENT ON COLUMN "tenants"."access_deny" IS 'ACL deny access control array';
COMMENT ON COLUMN "tenants"."trashed_at" IS 'Soft delete timestamp - tenant hidden but recoverable';
COMMENT ON COLUMN "tenants"."deleted_at" IS 'Hard delete timestamp - tenant marked for permanent removal';
-- Migration: Add naming_mode column to tenants table
-- Version: 001
-- Date: 2025-11-13
-- Description: Adds naming_mode column to support both enterprise (hash) and personal (custom) database naming

-- Check if column already exists before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' 
        AND column_name = 'naming_mode'
    ) THEN
        -- Add naming_mode column with default 'enterprise' to match existing behavior
        ALTER TABLE "tenants" 
        ADD COLUMN "naming_mode" VARCHAR(20) DEFAULT 'enterprise' 
        CHECK ("naming_mode" IN ('enterprise', 'personal'));
        
        -- Add comment
        COMMENT ON COLUMN "tenants"."naming_mode" IS 'Database naming mode: enterprise (SHA256 hash) or personal (custom name)';
        
        RAISE NOTICE 'Added naming_mode column to tenants table';
    ELSE
        RAISE NOTICE 'Column naming_mode already exists, skipping';
    END IF;
END $$;

-- Update all existing tenants to 'enterprise' mode (existing behavior)
-- This is safe because all existing databases use the hashed naming scheme
UPDATE "tenants" 
SET "naming_mode" = 'enterprise' 
WHERE "naming_mode" IS NULL;

-- Create index for faster filtering by naming mode (optional, for analytics)
CREATE INDEX IF NOT EXISTS "idx_tenants_naming_mode" ON "tenants" ("naming_mode");

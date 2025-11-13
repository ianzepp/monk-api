-- Migration: Add description column to tenants table
-- Version: 002
-- Date: 2025-11-13
-- Description: Adds optional description column for documenting tenant purpose

-- Check if column already exists before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' 
        AND column_name = 'description'
    ) THEN
        -- Add description column
        ALTER TABLE "tenants" 
        ADD COLUMN "description" TEXT;
        
        -- Add comment
        COMMENT ON COLUMN "tenants"."description" IS 'Optional human-readable description of the tenant';
        
        RAISE NOTICE 'Added description column to tenants table';
    ELSE
        RAISE NOTICE 'Column description already exists, skipping';
    END IF;
END $$;

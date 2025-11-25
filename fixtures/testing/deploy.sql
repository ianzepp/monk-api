-- Compiled Fixture: testing
-- Generated: 2025-11-23T17:42:02.516Z
-- Parameters: :database, :schema
--
-- Usage:
--   Replace :database and :schema placeholders before execution
--   Example: sed 's/:database/db_main/g; s/:schema/ns_tenant_abc123/g' deploy.sql | psql

BEGIN;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS :schema;

-- Set search path to target schema
SET search_path TO :schema, public;

-- ============================================================================
-- Testing Fixture Loader
-- ============================================================================
-- Loads testing template with minimal sample models for test suite
-- Extends: system template
--
-- Load Order:
-- 1. User initialization (init.sql)
-- 2. Model definitions (describe/*.sql)
-- 3. Sample data (data/*.sql)

-- ECHO: ''
-- ECHO: '=========================================='
-- ECHO: 'Loading Testing Fixture'
-- ECHO: '=========================================='
-- ECHO: ''

-- Phase 1: Model definitions
-- ECHO: '→ Phase 2: Model definitions'
-- BEGIN: describe/accounts.sql
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

-- END: describe/accounts.sql
-- BEGIN: describe/contacts.sql
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

-- END: describe/contacts.sql
-- ECHO: '✓ Models loaded: 2'
-- ECHO: ''

-- Phase 2: Sample data
-- ECHO: '→ Phase 3: Sample data'
-- BEGIN: data/accounts.sql
-- ============================================================================
-- DATA: Account model registration and sample data
-- ============================================================================

-- Register accounts model
INSERT INTO "models" (model_name, status)
VALUES ('accounts', 'active');

-- Register accounts fields
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('accounts', 'name', 'text', 'true', 'Account holder full name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('accounts', 'email', 'text', 'true', 'Primary email address', 255);

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('accounts', 'username', 'text', 'true', 'Unique username for login', '^[a-zA-Z0-9_-]{3,50}$');

INSERT INTO fields (model_name, field_name, type, required, default_value, description, enum_values)
  VALUES ('accounts', 'accounts_type', 'text', 'true', 'personal', 'Type of accounts', ARRAY['personal', 'business', 'trial', 'premium']);

INSERT INTO fields (model_name, field_name, type, required, default_value, description, minimum, maximum)
  VALUES ('accounts', 'balance', 'numeric', 'false', '0', 'Account balance in USD', 0, 1000000);

INSERT INTO fields (model_name, field_name, type, required, default_value, description)
  VALUES ('accounts', 'is_active', 'boolean', 'false', 'true', 'Whether the accounts is currently active');

INSERT INTO fields (model_name, field_name, type, required, default_value, description)
  VALUES ('accounts', 'is_verified', 'boolean', 'false', 'false', 'Whether the accounts email is verified');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('accounts', 'credit_limit', 'numeric', 'false', 'Credit limit for business accountss (null for personal/trial)', 0, 10000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('accounts', 'last_login', 'timestamp', 'false', 'Timestamp of last login (null if never logged in)');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('accounts', 'preferences', 'jsonb', 'false', 'User preferences and settings');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('accounts', 'metadata', 'jsonb', 'false', 'Additional flexible metadata');

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('accounts', 'phone', 'text', 'false', 'Phone number (optional)', '^\+?[1-9]\d{1,14}$|^\+?1 \([0-9]{3}\) [0-9]{3}-[0-9]{4}$');

-- Sample data
INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('John Smith', 'john.smith@example.com', 'jsmith', 'personal', 1250.75, true, true, NULL, NULL);

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Jane Doe', 'jane.doe@business.com', 'jdoe', 'business', 5000, true, true, 10000, NULL);

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Bob Johnson', 'bob@startup.io', 'bjohnson', 'trial', 0, true, false, NULL, NULL);

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Alice Wilson', 'alice.wilson@corp.com', 'awilson', 'premium', 2500.25, true, true, 5000, '{"theme":"dark","notifications":true,"language":"en"}');

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Charlie Brown', 'charlie@demo.test', 'cbrown', 'personal', 150, false, false, NULL, NULL);

-- END: data/accounts.sql
-- BEGIN: data/contacts.sql
-- ============================================================================
-- DATA: Contact model registration and sample data
-- ============================================================================

-- Register contacts model
INSERT INTO "models" (model_name, status)
VALUES ('contacts', 'active');

-- Register contacts fields
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('contacts', 'name', 'text', 'true', 'Contact full name', 1, 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('contacts', 'email', 'text', 'true', 'Contact email address');

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('contacts', 'phone', 'text', 'false', 'Contact phone number', '^\+?[1-9]\d{1,14}$');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('contacts', 'company', 'text', 'false', 'Company name', 100);

INSERT INTO fields (model_name, field_name, type, required, default_value, description, enum_values)
  VALUES ('contacts', 'status', 'text', 'false', 'prospect', 'Contact status', ARRAY['active', 'inactive', 'prospect']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('contacts', 'notes', 'text', 'false', 'Additional notes about the contacts');

-- Sample data
INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('David Miller', 'david.miller@client.com', '+15551234567', 'Miller & Associates', 'active', 'Primary contacts for Miller & Associates account');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Sarah Connor', 'sarah@techcorp.com', '+15559876543', 'TechCorp Solutions', 'active', 'Technical lead, prefers email communication');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Mike Thompson', 'mike.thompson@startup.io', '+15554567890', 'Innovation Startup', 'prospect', 'Interested in premium features, follow up in Q3');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Lisa Rodriguez', 'lisa@consulting.biz', '+15553210987', 'Rodriguez Consulting', 'active', 'Long-term client, very satisfied with service');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Tom Wilson', 'tom.wilson@oldcorp.com', NULL, 'Legacy Corp', 'inactive', 'Account closed, contacts moved to competitor');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Emily Johnson', 'emily@newventure.com', '+15555551234', 'New Venture LLC', 'prospect', 'Demo scheduled for next week');

-- END: data/contacts.sql
-- BEGIN: data/users.sql
-- Testing Fixture Initialization
-- This runs after init-template-default.sql but before models and data are loaded

-- Insert core users for testing
-- Root user already exists (created in the default template)
-- These users are required by many tests that authenticate with specific access levels

INSERT INTO users (name, auth, access) VALUES
    ('Mr Full', 'full', 'full'),
    ('Jr User', 'user', 'edit')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Testing fixture includes pre-configured users for test authentication';

-- END: data/users.sql
-- ECHO: '✓ Data loaded: 3 tables'
-- ECHO: ''

-- ECHO: '=========================================='
-- ECHO: '✓ Testing Fixture Loaded Successfully'
-- ECHO: '=========================================='
-- ECHO: ''

COMMIT;

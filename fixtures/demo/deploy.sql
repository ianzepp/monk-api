-- Compiled Fixture: demo
-- Generated: 2025-11-23T15:17:45.266Z
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
-- Demo Fixture Loader
-- ============================================================================
-- Loads comprehensive demo template with workspaces, teams, repositories,
-- projects, tasks, issues, conversations, and docs
-- Extends: system template
--
-- Load Order:
-- 1. Model definitions (describe/*.sql) - ordered by dependencies
-- 2. Sample data (data/*.sql) - numbered for dependency order

-- ECHO: ''
-- ECHO: '=========================================='
-- ECHO: 'Loading Demo Fixture'
-- ECHO: '=========================================='
-- ECHO: ''

-- Phase 1: Model definitions (ordered by foreign key dependencies)
-- ECHO: '→ Phase 1: Model definitions'

-- Base models (no dependencies)
-- BEGIN: describe/workspaces.sql
-- ============================================================================
-- MODEL: workspaces
-- ============================================================================
-- Top-level organizational containers for multi-tenant simulation

CREATE TABLE "workspaces" (
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

    -- Workspace fields
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "slug" text NOT NULL CHECK (char_length(slug) <= 100 AND slug ~ '^[a-z0-9-]+$'),
    "description" text CHECK (description IS NULL OR char_length(description) <= 500),
    "settings" jsonb,

    -- Constraints
    CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);

-- END: describe/workspaces.sql
-- BEGIN: describe/teams.sql
-- ============================================================================
-- MODEL: teams
-- ============================================================================
-- Development teams and groups within workspaces

CREATE TABLE "teams" (
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

    -- Team fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "description" text CHECK (description IS NULL OR char_length(description) <= 500),
    "focus_area" text CHECK (focus_area IS NULL OR focus_area IN ('backend', 'frontend', 'ai-ml', 'devops', 'design', 'product', 'data')),

    -- Constraints
    CONSTRAINT "teams_workspace_name_unique" UNIQUE(workspace_id, name)
);

-- END: describe/teams.sql

-- Member model (depends on workspaces, teams)
-- BEGIN: describe/members.sql
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

-- END: describe/members.sql

-- Repository models (depend on workspaces)
-- BEGIN: describe/repositories.sql
-- ============================================================================
-- MODEL: repositories
-- ============================================================================
-- Code repositories (management layer, not git internals)

CREATE TABLE "repositories" (
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

    -- Repository fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "slug" text NOT NULL CHECK (char_length(slug) <= 100 AND slug ~ '^[a-z0-9-]+$'),
    "description" text CHECK (description IS NULL OR char_length(description) <= 1000),
    "visibility" text CHECK (visibility IS NULL OR visibility IN ('public', 'private', 'internal')),
    "primary_language" text CHECK (primary_language IS NULL OR char_length(primary_language) <= 50),
    "topics" text[],
    "stars" integer CHECK (stars IS NULL OR (stars >= 0 AND stars <= 999999)),

    -- Constraints
    CONSTRAINT "repositories_workspace_slug_unique" UNIQUE(workspace_id, slug)
);

-- END: describe/repositories.sql
-- BEGIN: describe/releases.sql
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

-- END: describe/releases.sql

-- Project and task models (depend on workspaces, repositories)
-- BEGIN: describe/projects.sql
-- ============================================================================
-- MODEL: projects
-- ============================================================================
-- Projects and initiatives within workspaces

CREATE TABLE "projects" (
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

    -- Project fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "name" text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    "description" text CHECK (description IS NULL OR char_length(description) <= 2000),
    "status" text CHECK (status IS NULL OR status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
    "start_date" date,
    "end_date" date,
    "owner" text CHECK (owner IS NULL OR char_length(owner) <= 100),
    "tags" text[],

    -- Constraints
    CONSTRAINT "projects_workspace_name_unique" UNIQUE(workspace_id, name)
);

-- END: describe/projects.sql
-- BEGIN: describe/tasks.sql
-- ============================================================================
-- MODEL: tasks
-- ============================================================================
-- Tasks, todos, and action items

CREATE TABLE "tasks" (
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

    -- Task fields
    "project_id" uuid REFERENCES projects(id),
    "title" text NOT NULL CHECK (char_length(title) >= 2 AND char_length(title) <= 200),
    "description" text CHECK (description IS NULL OR char_length(description) <= 5000),
    "status" text CHECK (status IS NULL OR status IN ('todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled')),
    "priority" text CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
    "assignee" text CHECK (assignee IS NULL OR char_length(assignee) <= 100),
    "due_date" date,
    "tags" text[],
    "estimated_hours" integer CHECK (estimated_hours IS NULL OR (estimated_hours >= 0 AND estimated_hours <= 1000)),
    "completed_at" timestamp
);

-- END: describe/tasks.sql

-- Issue models (depend on repositories)
-- BEGIN: describe/issues.sql
-- ============================================================================
-- MODEL: issues
-- ============================================================================
-- Issue tracking and bug reports

CREATE TABLE "issues" (
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

    -- Issue fields
    "repository_id" uuid NOT NULL REFERENCES repositories(id),
    "title" text NOT NULL CHECK (char_length(title) >= 2 AND char_length(title) <= 200),
    "description" text CHECK (description IS NULL OR char_length(description) <= 10000),
    "status" text CHECK (status IS NULL OR status IN ('open', 'in_progress', 'closed', 'wont_fix', 'duplicate')),
    "priority" text CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
    "labels" text[],
    "assignee" text CHECK (assignee IS NULL OR char_length(assignee) <= 100),
    "reported_by" text CHECK (reported_by IS NULL OR char_length(reported_by) <= 100),
    "closed_at" timestamp
);

-- END: describe/issues.sql
-- BEGIN: describe/issue_comments.sql
-- ============================================================================
-- MODEL: issue_comments
-- ============================================================================
-- Comments and discussion on issues

CREATE TABLE "issue_comments" (
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

    -- Comment fields
    "issue_id" uuid NOT NULL REFERENCES issues(id),
    "author" text NOT NULL CHECK (char_length(author) <= 100),
    "body" text NOT NULL CHECK (char_length(body) <= 5000)
);

-- END: describe/issue_comments.sql

-- Communication models (depend on workspaces, members)
-- BEGIN: describe/conversations.sql
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

-- END: describe/conversations.sql
-- BEGIN: describe/messages.sql
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

-- END: describe/messages.sql

-- Documentation model (depends on workspaces)
-- BEGIN: describe/docs.sql
-- ============================================================================
-- MODEL: docs
-- ============================================================================
-- Large text documentation with full-text search capabilities

CREATE TABLE "docs" (
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

    -- Documentation fields
    "workspace_id" uuid NOT NULL REFERENCES workspaces(id),
    "title" text NOT NULL CHECK (char_length(title) >= 2 AND char_length(title) <= 200),
    "content" text NOT NULL CHECK (char_length(content) <= 100000),
    "content_type" text CHECK (content_type IS NULL OR content_type IN ('markdown', 'plaintext', 'code', 'adr', 'api-spec')),
    "tags" text[],
    "category" text CHECK (category IS NULL OR category IN ('reference', 'guide', 'adr', 'runbook', 'architecture', 'tutorial')),
    "author" text CHECK (author IS NULL OR char_length(author) <= 100),
    "version" text CHECK (version IS NULL OR char_length(version) <= 50),
    "metadata" jsonb,
    "accessed_at" timestamp
);

-- END: describe/docs.sql

-- ECHO: '✓ Models loaded: 12'
-- ECHO: ''

-- Phase 2: Sample data (numbered for dependency order)
-- ECHO: '→ Phase 2: Sample data'

-- BEGIN: data/01-workspaces-teams.sql
-- ============================================================================
-- DATA: Workspaces and Teams model registration and sample data
-- ============================================================================

-- Register workspaces model
INSERT INTO "models" (model_name, status)
VALUES ('workspaces', 'active');

-- Register workspaces fields
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('workspaces', 'name', 'text', 'true', 'Organization name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum, pattern, "unique")
  VALUES ('workspaces', 'slug', 'text', 'true', 'URL-friendly identifier (lowercase, alphanumeric, hyphens)', 100, '^[a-z0-9-]+$', 'true');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('workspaces', 'description', 'text', 'false', 'Organization description', 500);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('workspaces', 'settings', 'jsonb', 'false', 'Workspace settings (theme, preferences, feature flags)');

-- Register teams model
INSERT INTO "models" (model_name, status, description)
  VALUES ('teams', 'active', 'Development teams and groups within workspaces');

-- Register teams fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('teams', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('teams', 'name', 'text', 'true', 'Team name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('teams', 'description', 'text', 'false', 'Team description', 500);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('teams', 'focus_area', 'text', 'false', 'Team focus area', ARRAY['backend', 'frontend', 'ai-ml', 'devops', 'design', 'product', 'data']);

-- Sample data for workspaces and teams
-- Using CTEs with gen_random_uuid() for true random IDs

-- Insert workspaces and teams in one transaction
WITH inserted_workspaces AS (
  INSERT INTO workspaces (name, slug, description, settings, created_at) VALUES
    ('Acme Corporation', 'acme-corp', 'Enterprise software solutions and consulting services', '{"theme": "blue", "features": ["analytics", "reporting"]}', now() - interval '180 days'),
    ('TechStart Labs', 'techstart-labs', 'Innovative AI and machine learning research startup', '{"theme": "dark", "features": ["ai", "beta-access"]}', now() - interval '150 days'),
    ('DevTools Inc', 'devtools-inc', 'Developer productivity tools and platforms', '{"theme": "green", "features": ["integrations", "api-access"]}', now() - interval '120 days'),
    ('CloudScale Systems', 'cloudscale', 'Cloud infrastructure and scaling solutions', '{"theme": "purple", "features": ["monitoring", "autoscale"]}', now() - interval '90 days'),
    ('DataPipe Co', 'datapipe', 'Real-time data pipeline and analytics platform', '{"theme": "orange", "features": ["streaming", "analytics"]}', now() - interval '60 days'),
    ('SecureAuth Solutions', 'secureauth', 'Identity and authentication services', '{"theme": "red", "features": ["sso", "2fa", "compliance"]}', now() - interval '30 days')
  RETURNING id, name, slug, created_at
),
inserted_teams AS (
  INSERT INTO teams (workspace_id, name, description, focus_area, created_at)
  -- Acme Corporation teams
  SELECT id, 'Backend Engineering', 'Core API and backend services', 'backend', created_at + interval '5 days'
  FROM inserted_workspaces WHERE slug = 'acme-corp'
  UNION ALL
  SELECT id, 'Frontend Team', 'Web and mobile user interfaces', 'frontend', created_at + interval '5 days'
  FROM inserted_workspaces WHERE slug = 'acme-corp'

  -- TechStart Labs teams
  UNION ALL
  SELECT id, 'AI/ML Research', 'Machine learning models and research', 'ai-ml', created_at + interval '3 days'
  FROM inserted_workspaces WHERE slug = 'techstart-labs'
  UNION ALL
  SELECT id, 'Data Engineering', 'Data pipelines and infrastructure', 'backend', created_at + interval '7 days'
  FROM inserted_workspaces WHERE slug = 'techstart-labs'

  -- DevTools Inc teams
  UNION ALL
  SELECT id, 'DevOps & Infrastructure', 'CI/CD and cloud infrastructure', 'devops', created_at + interval '4 days'
  FROM inserted_workspaces WHERE slug = 'devtools-inc'
  UNION ALL
  SELECT id, 'Product Design', 'UX/UI and product design', 'design', created_at + interval '6 days'
  FROM inserted_workspaces WHERE slug = 'devtools-inc'

  -- CloudScale Systems teams
  UNION ALL
  SELECT id, 'Platform Engineering', 'Core platform and scaling systems', 'backend', created_at + interval '2 days'
  FROM inserted_workspaces WHERE slug = 'cloudscale'

  -- DataPipe Co teams
  UNION ALL
  SELECT id, 'Streaming Infrastructure', 'Real-time data streaming', 'backend', created_at + interval '3 days'
  FROM inserted_workspaces WHERE slug = 'datapipe'
  UNION ALL
  SELECT id, 'Analytics Team', 'Analytics and visualization', 'data', created_at + interval '5 days'
  FROM inserted_workspaces WHERE slug = 'datapipe'

  -- SecureAuth Solutions teams
  UNION ALL
  SELECT id, 'Security Engineering', 'Authentication and security services', 'backend', created_at + interval '2 days'
  FROM inserted_workspaces WHERE slug = 'secureauth'

  RETURNING id, workspace_id, name, created_at
)
SELECT COUNT(*) FROM inserted_teams;

-- END: data/01-workspaces-teams.sql
-- BEGIN: data/02-members.sql
-- ============================================================================
-- DATA: Members model registration and sample data
-- ============================================================================

-- Register members model
INSERT INTO "models" (model_name, status, description)
  VALUES ('members', 'active', 'Team members and users');

-- Register members fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('members', 'team_id', 'uuid', 'true', 'Foreign key to teams table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('members', 'name', 'text', 'true', 'Member full name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum, pattern)
  VALUES ('members', 'email', 'text', 'true', 'Email address', 255, '^[^@]+@[^@]+\.[^@]+$');

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('members', 'role', 'text', 'false', 'Member role in team', ARRAY['lead', 'senior', 'mid', 'junior', 'intern']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('members', 'timezone', 'text', 'false', 'Timezone identifier', 50);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('members', 'avatar_url', 'text', 'false', 'URL to avatar image', 500);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('members', 'joined_at', 'timestamp', 'false', 'Timestamp when member joined the team');

-- Sample data for members
-- References teams created in 01-workspaces-teams.sql

INSERT INTO members (team_id, name, email, role, timezone, avatar_url, joined_at)
-- Get team IDs and insert members
SELECT
  t.id,
  m.name,
  m.email,
  m.role,
  m.timezone,
  m.avatar_url,
  t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    -- Backend Engineering (Acme Corp)
    ('Alice Johnson', 'alice.johnson@acme-corp.com', 'lead', 'America/New_York', 'https://i.pravatar.cc/150?img=1', '2'),
    ('Bob Martinez', 'bob.martinez@acme-corp.com', 'senior', 'America/Los_Angeles', 'https://i.pravatar.cc/150?img=2', '5'),
    ('Carol Zhang', 'carol.zhang@acme-corp.com', 'mid', 'Asia/Shanghai', 'https://i.pravatar.cc/150?img=3', '10'),
    ('David Kumar', 'david.kumar@acme-corp.com', 'mid', 'Asia/Kolkata', null, '15'),
    ('Emma Wilson', 'emma.wilson@acme-corp.com', 'junior', 'Europe/London', 'https://i.pravatar.cc/150?img=5', '20')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Backend Engineering'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Frank Chen', 'frank.chen@acme-corp.com', 'lead', 'America/Chicago', 'https://i.pravatar.cc/150?img=6', '3'),
    ('Grace Park', 'grace.park@acme-corp.com', 'senior', 'Asia/Seoul', 'https://i.pravatar.cc/150?img=7', '7'),
    ('Henry Thompson', 'henry.thompson@acme-corp.com', 'mid', 'Europe/Paris', null, '12'),
    ('Iris Patel', 'iris.patel@acme-corp.com', 'junior', 'America/New_York', 'https://i.pravatar.cc/150?img=9', '18')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Frontend Team'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Dr. Sarah Mitchell', 'sarah.mitchell@techstart.io', 'lead', 'America/San_Francisco', 'https://i.pravatar.cc/150?img=10', '1'),
    ('James Rodriguez', 'james.rodriguez@techstart.io', 'senior', 'America/New_York', 'https://i.pravatar.cc/150?img=11', '4'),
    ('Kim Lee', 'kim.lee@techstart.io', 'senior', 'Asia/Singapore', 'https://i.pravatar.cc/150?img=12', '8'),
    ('Lisa Anderson', 'lisa.anderson@techstart.io', 'mid', 'Europe/London', null, '14'),
    ('Mike O''Brien', 'mike.obrien@techstart.io', 'junior', 'Europe/Dublin', 'https://i.pravatar.cc/150?img=14', '22')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'AI/ML Research'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Nina Gupta', 'nina.gupta@techstart.io', 'senior', 'Asia/Kolkata', 'https://i.pravatar.cc/150?img=15', '2'),
    ('Oscar Silva', 'oscar.silva@techstart.io', 'mid', 'America/Sao_Paulo', 'https://i.pravatar.cc/150?img=16', '9'),
    ('Paula Nowak', 'paula.nowak@techstart.io', 'mid', 'Europe/Warsaw', null, '16'),
    ('Quinn Davis', 'quinn.davis@techstart.io', 'junior', 'America/Denver', 'https://i.pravatar.cc/150?img=18', '25')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Data Engineering'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Rachel Green', 'rachel.green@devtools.dev', 'lead', 'America/Seattle', 'https://i.pravatar.cc/150?img=19', '1'),
    ('Sam Taylor', 'sam.taylor@devtools.dev', 'senior', 'America/Austin', 'https://i.pravatar.cc/150?img=20', '5'),
    ('Tina Brown', 'tina.brown@devtools.dev', 'mid', 'Europe/Amsterdam', 'https://i.pravatar.cc/150?img=21', '11'),
    ('Uma Patel', 'uma.patel@devtools.dev', 'junior', 'Asia/Mumbai', null, '19')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'DevOps & Infrastructure'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Victor Wong', 'victor.wong@devtools.dev', 'lead', 'Asia/Hong_Kong', 'https://i.pravatar.cc/150?img=22', '2'),
    ('Wendy Garcia', 'wendy.garcia@devtools.dev', 'senior', 'America/Mexico_City', 'https://i.pravatar.cc/150?img=23', '8'),
    ('Xavier Kim', 'xavier.kim@devtools.dev', 'mid', 'Asia/Seoul', null, '15'),
    ('Yuki Tanaka', 'yuki.tanaka@devtools.dev', 'mid', 'Asia/Tokyo', 'https://i.pravatar.cc/150?img=25', '21')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Product Design'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Zara Ahmed', 'zara.ahmed@cloudscale.cloud', 'lead', 'Europe/London', 'https://i.pravatar.cc/150?img=26', '1'),
    ('Adam Scott', 'adam.scott@cloudscale.cloud', 'senior', 'America/New_York', 'https://i.pravatar.cc/150?img=27', '4'),
    ('Beth Murphy', 'beth.murphy@cloudscale.cloud', 'senior', 'Europe/Dublin', 'https://i.pravatar.cc/150?img=28', '7'),
    ('Chris Li', 'chris.li@cloudscale.cloud', 'mid', 'America/Vancouver', null, '13'),
    ('Diana Ross', 'diana.ross@cloudscale.cloud', 'mid', 'America/Chicago', 'https://i.pravatar.cc/150?img=30', '20')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Platform Engineering'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Ethan Hunt', 'ethan.hunt@datapipe.io', 'senior', 'America/Denver', 'https://i.pravatar.cc/150?img=31', '2'),
    ('Fiona Apple', 'fiona.apple@datapipe.io', 'mid', 'America/Portland', 'https://i.pravatar.cc/150?img=32', '9'),
    ('George Martin', 'george.martin@datapipe.io', 'mid', 'Europe/London', null, '16')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Streaming Infrastructure'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Hannah Baker', 'hannah.baker@datapipe.io', 'lead', 'America/San_Francisco', 'https://i.pravatar.cc/150?img=33', '1'),
    ('Ian Malcolm', 'ian.malcolm@datapipe.io', 'senior', 'America/Los_Angeles', 'https://i.pravatar.cc/150?img=34', '6'),
    ('Julia Roberts', 'julia.roberts@datapipe.io', 'mid', 'America/New_York', 'https://i.pravatar.cc/150?img=35', '12')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Analytics Team'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Kevin Flynn', 'kevin.flynn@secureauth.net', 'lead', 'America/Seattle', 'https://i.pravatar.cc/150?img=36', '1'),
    ('Laura Palmer', 'laura.palmer@secureauth.net', 'senior', 'America/Pacific', 'https://i.pravatar.cc/150?img=37', '5'),
    ('Mark Twain', 'mark.twain@secureauth.net', 'senior', 'America/Eastern', 'https://i.pravatar.cc/150?img=38', '10'),
    ('Nancy Drew', 'nancy.drew@secureauth.net', 'mid', 'America/Chicago', null, '17'),
    ('Oliver Twist', 'oliver.twist@secureauth.net', 'junior', 'Europe/London', 'https://i.pravatar.cc/150?img=40', '24')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Security Engineering';

-- END: data/02-members.sql
-- BEGIN: data/03-repositories-releases.sql
-- ============================================================================
-- DATA: Repositories and Releases model registration and sample data
-- ============================================================================

-- Register repositories model
INSERT INTO "models" (model_name, status, description)
  VALUES ('repositories', 'active', 'Code repositories for project management');

-- Register repositories fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('repositories', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('repositories', 'name', 'text', 'true', 'Repository name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum, pattern)
  VALUES ('repositories', 'slug', 'text', 'true', 'URL-friendly identifier', 100, '^[a-z0-9-]+$');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('repositories', 'description', 'text', 'false', 'Repository description', 1000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('repositories', 'visibility', 'text', 'false', 'Repository visibility', ARRAY['public', 'private', 'internal']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('repositories', 'primary_language', 'text', 'false', 'Primary programming language', 50);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('repositories', 'topics', 'text[]', 'false', 'Repository topics/tags for categorization');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('repositories', 'stars', 'integer', 'false', 'Star count', 0, 999999);

-- Register releases model
INSERT INTO "models" (model_name, status, description)
  VALUES ('releases', 'active', 'Software releases, tags, and versioning');

-- Register releases fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('releases', 'repository_id', 'uuid', 'true', 'Foreign key to repositories table');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'version', 'text', 'true', 'Semantic version number', 50);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'name', 'text', 'false', 'Human-readable release name', 200);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'description', 'text', 'false', 'Release notes and changelog', 10000);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'tag', 'text', 'false', 'Git tag name', 100);

INSERT INTO fields (model_name, field_name, type, required, description, default_value)
  VALUES ('releases', 'is_prerelease', 'boolean', 'false', 'Whether this is a prerelease version', 'false');

INSERT INTO fields (model_name, field_name, type, required, description, default_value)
  VALUES ('releases', 'is_draft', 'boolean', 'false', 'Whether this is a draft release', 'false');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'published_by', 'text', 'false', 'Member name who published the release', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('releases', 'published_at', 'timestamp', 'false', 'Timestamp when release was published');

-- Sample data for repositories and releases
-- References workspaces created in 01-workspaces-teams.sql

-- Insert repositories
WITH inserted_repositories AS (
  INSERT INTO repositories (workspace_id, name, slug, description, visibility, primary_language, topics, stars, created_at, updated_at)
  SELECT
    w.id,
    r.name,
    r.slug,
    r.description,
    r.visibility,
    r.primary_language,
    r.topics,
    r.stars,
    w.created_at + (r.days_after || ' days')::interval,
    w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      -- Acme Corp repositories
      ('acme-api', 'acme-api', 'Core API server and backend services', 'private', 'TypeScript', ARRAY['api', 'backend', 'rest'], 45, '10', '15'),
      ('acme-web', 'acme-web', 'Customer-facing web application', 'private', 'React', ARRAY['frontend', 'react', 'ui'], 32, '15', '5'),
      ('acme-mobile', 'acme-mobile', 'iOS and Android mobile applications', 'private', 'React Native', ARRAY['mobile', 'ios', 'android'], 28, '20', '10')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'acme-corp'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('ml-models', 'ml-models', 'Machine learning model training and deployment', 'public', 'Python', ARRAY['ml', 'ai', 'pytorch'], 234, '8', '3'),
      ('data-pipeline', 'data-pipeline', 'Real-time data processing pipeline', 'public', 'Python', ARRAY['data', 'streaming', 'kafka'], 156, '12', '7'),
      ('research-notebooks', 'research-notebooks', 'Jupyter notebooks for research experiments', 'private', 'Jupyter Notebook', ARRAY['research', 'jupyter'], 12, '18', '12')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'techstart-labs'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('cli-tools', 'cli-tools', 'Command-line developer tools', 'public', 'Go', ARRAY['cli', 'tools', 'devtools'], 421, '7', '2'),
      ('vscode-extension', 'vscode-extension', 'VS Code extension for productivity', 'public', 'TypeScript', ARRAY['vscode', 'extension'], 312, '14', '8'),
      ('api-client', 'api-client', 'REST API client library', 'public', 'JavaScript', ARRAY['api', 'sdk', 'client'], 189, '21', '14')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'devtools-inc'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('autoscaler', 'autoscaler', 'Intelligent auto-scaling system', 'private', 'Rust', ARRAY['scaling', 'cloud', 'kubernetes'], 67, '5', '4'),
      ('monitoring-agent', 'monitoring-agent', 'System monitoring and metrics collection', 'public', 'Go', ARRAY['monitoring', 'metrics'], 145, '10', '6'),
      ('load-balancer', 'load-balancer', 'High-performance load balancer', 'private', 'Rust', ARRAY['networking', 'performance'], 89, '15', '9')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'cloudscale'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('stream-processor', 'stream-processor', 'High-throughput stream processing engine', 'public', 'Java', ARRAY['streaming', 'bigdata'], 278, '6', '5'),
      ('analytics-dashboard', 'analytics-dashboard', 'Real-time analytics visualization', 'private', 'React', ARRAY['analytics', 'dashboard'], 34, '12', '8')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'datapipe'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('auth-service', 'auth-service', 'Authentication and authorization service', 'private', 'Go', ARRAY['auth', 'security', 'oauth'], 112, '4', '2'),
      ('2fa-lib', '2fa-lib', 'Two-factor authentication library', 'public', 'TypeScript', ARRAY['2fa', 'security', 'library'], 201, '8', '6'),
      ('sso-gateway', 'sso-gateway', 'Single sign-on gateway service', 'private', 'Go', ARRAY['sso', 'saml', 'oauth'], 78, '14', '11')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'secureauth'

  RETURNING id, name, slug, created_at
)
-- Insert releases for repositories
INSERT INTO releases (repository_id, version, name, description, tag, is_prerelease, is_draft, published_by, published_at, created_at)
SELECT
  ir.id,
  rel.version,
  rel.name,
  rel.description,
  rel.tag,
  rel.is_prerelease::boolean,
  rel.is_draft::boolean,
  rel.published_by,
  ir.created_at + (rel.days_after || ' days')::interval,
  ir.created_at + (rel.days_after || ' days')::interval - interval '2 days'
FROM inserted_repositories ir
CROSS JOIN LATERAL (
  VALUES
    ('v1.0.0', 'Initial Release', 'First production release with core features', 'v1.0.0', 'false', 'false', 'Alice Johnson', '30'),
    ('v1.1.0', 'Feature Update', 'Added new authentication methods', 'v1.1.0', 'false', 'false', 'Bob Martinez', '60'),
    ('v1.2.0', 'Performance Improvements', 'Optimized query performance and caching', 'v1.2.0', 'false', 'false', 'Alice Johnson', '90')
) AS rel(version, name, description, tag, is_prerelease, is_draft, published_by, days_after)
WHERE ir.slug IN ('acme-api', 'ml-models', 'cli-tools', 'autoscaler', 'stream-processor', 'auth-service')

UNION ALL

SELECT ir.id, rel.version, rel.name, rel.description, rel.tag, rel.is_prerelease::boolean, rel.is_draft::boolean, rel.published_by,
       ir.created_at + (rel.days_after || ' days')::interval,
       ir.created_at + (rel.days_after || ' days')::interval - interval '2 days'
FROM inserted_repositories ir
CROSS JOIN LATERAL (
  VALUES
    ('v2.0.0-beta.1', 'Beta Release', 'Testing new UI components', 'v2.0.0-beta.1', 'true', 'false', 'Frank Chen', '45'),
    ('v2.0.0', 'Major Version 2.0', 'Complete UI redesign and new features', 'v2.0.0', 'false', 'false', 'Grace Park', '75')
) AS rel(version, name, description, tag, is_prerelease, is_draft, published_by, days_after)
WHERE ir.slug IN ('acme-web', 'vscode-extension', 'analytics-dashboard', '2fa-lib')

UNION ALL

SELECT ir.id, rel.version, rel.name, rel.description, rel.tag, rel.is_prerelease::boolean, rel.is_draft::boolean, rel.published_by,
       ir.created_at + (rel.days_after || ' days')::interval,
       ir.created_at + (rel.days_after || ' days')::interval - interval '2 days'
FROM inserted_repositories ir
CROSS JOIN LATERAL (
  VALUES
    ('v0.9.0', 'Release Candidate', 'Feature complete, testing in progress', 'v0.9.0', 'true', 'false', 'Rachel Green', '25')
) AS rel(version, name, description, tag, is_prerelease, is_draft, published_by, days_after)
WHERE ir.slug IN ('acme-mobile', 'data-pipeline', 'api-client', 'monitoring-agent', 'sso-gateway');

-- END: data/03-repositories-releases.sql
-- BEGIN: data/04-issues-comments.sql
-- ============================================================================
-- DATA: Issues and Comments model registration and sample data
-- ============================================================================

-- Register issues model
INSERT INTO "models" (model_name, status, description)
  VALUES ('issues', 'active', 'Issue tracking and bug reports');

-- Register issues fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issues', 'repository_id', 'uuid', 'true', 'Foreign key to repositories table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('issues', 'title', 'text', 'true', 'Issue title', 2, 200);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issues', 'description', 'text', 'false', 'Detailed issue description', 10000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('issues', 'status', 'text', 'false', 'Issue status', ARRAY['open', 'in_progress', 'closed', 'wont_fix', 'duplicate']);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('issues', 'priority', 'text', 'false', 'Issue priority', ARRAY['critical', 'high', 'medium', 'low']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issues', 'labels', 'text[]', 'false', 'Issue labels for categorization');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issues', 'assignee', 'text', 'false', 'Member name assigned to this issue', 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issues', 'reported_by', 'text', 'false', 'Member name who reported the issue', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issues', 'closed_at', 'timestamp', 'false', 'Timestamp when issue was closed');

-- Register issue_comments model
INSERT INTO "models" (model_name, status, description)
  VALUES ('issue_comments', 'active', 'Comments and discussion on issues');

-- Register issue_comments fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issue_comments', 'issue_id', 'uuid', 'true', 'Foreign key to issues table');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issue_comments', 'author', 'text', 'true', 'Comment author name', 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issue_comments', 'body', 'text', 'true', 'Comment content', 5000);

-- Sample data for issues and comments
-- References repositories created in 03-repositories-releases.sql

-- Insert issues
WITH inserted_issues AS (
  INSERT INTO issues (repository_id, title, description, status, priority, labels, assignee, reported_by, created_at, updated_at, closed_at)
  SELECT
    r.id,
    i.title,
    i.description,
    i.status,
    i.priority,
    i.labels,
    i.assignee,
    i.reported_by,
    r.created_at + (i.days_after || ' days')::interval,
    r.created_at + (i.days_after || ' days')::interval + (i.days_since_update || ' days')::interval,
    CASE WHEN i.status = 'closed' THEN r.created_at + (i.days_after || ' days')::interval + (i.days_since_update || ' days')::interval ELSE NULL END
  FROM repositories r
  CROSS JOIN LATERAL (
    VALUES
      ('Authentication timeout on mobile devices', 'Users are experiencing session timeouts after 5 minutes of inactivity on mobile apps', 'open', 'high', ARRAY['bug', 'mobile', 'auth'], 'Bob Martinez', 'Alice Johnson', '15', '3'),
      ('Add rate limiting to API endpoints', 'Implement rate limiting to prevent abuse', 'in_progress', 'medium', ARRAY['enhancement', 'api', 'security'], 'Carol Zhang', 'Alice Johnson', '20', '5'),
      ('Memory leak in background sync', 'Background sync process is consuming increasing amounts of memory over time', 'open', 'critical', ARRAY['bug', 'performance'], 'David Kumar', 'Bob Martinez', '25', '2'),
      ('Update dependencies to latest versions', 'Security audit flagged outdated dependencies', 'closed', 'high', ARRAY['dependencies', 'security'], 'Emma Wilson', 'Carol Zhang', '30', '15')
  ) AS i(title, description, status, priority, labels, assignee, reported_by, days_after, days_since_update)
  WHERE r.slug IN ('acme-api', 'ml-models', 'cli-tools')
  LIMIT 50

  RETURNING id, repository_id, title, created_at
)
-- Insert comments for issues
INSERT INTO issue_comments (issue_id, author, body, created_at)
SELECT
  ii.id,
  c.author,
  c.body,
  ii.created_at + (c.days_after || ' days')::interval
FROM inserted_issues ii
CROSS JOIN LATERAL (
  VALUES
    ('Alice Johnson', 'I''ve reproduced this on iOS 16.4. Investigating the session management code.', '1'),
    ('Bob Martinez', 'Found the issue - the token refresh logic has a race condition. Working on a fix.', '2'),
    ('Carol Zhang', 'PR #234 submitted with the fix. Ready for review.', '4')
) AS c(author, body, days_after)
WHERE ii.title LIKE '%timeout%' OR ii.title LIKE '%memory leak%';

-- END: data/04-issues-comments.sql
-- BEGIN: data/05-projects-tasks.sql
-- ============================================================================
-- DATA: Projects and Tasks model registration and sample data
-- ============================================================================

-- Register projects model
INSERT INTO "models" (model_name, status, description)
  VALUES ('projects', 'active', 'Projects and initiatives within workspaces');

-- Register projects fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('projects', 'name', 'text', 'true', 'Project name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('projects', 'description', 'text', 'false', 'Project description', 2000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('projects', 'status', 'text', 'false', 'Project status', ARRAY['planning', 'active', 'on_hold', 'completed', 'cancelled']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'start_date', 'date', 'false', 'Project start date');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'end_date', 'date', 'false', 'Project end date');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('projects', 'owner', 'text', 'false', 'Project owner/lead name', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'tags', 'text[]', 'false', 'Project tags for categorization');

-- Register tasks model
INSERT INTO "models" (model_name, status, description)
  VALUES ('tasks', 'active', 'Tasks, todos, and action items');

-- Register tasks fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'project_id', 'uuid', 'false', 'Foreign key to projects table (nullable for standalone tasks)');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('tasks', 'title', 'text', 'true', 'Task title', 2, 200);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('tasks', 'description', 'text', 'false', 'Task description', 5000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('tasks', 'status', 'text', 'false', 'Task status', ARRAY['todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled']);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('tasks', 'priority', 'text', 'false', 'Task priority', ARRAY['critical', 'high', 'medium', 'low']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('tasks', 'assignee', 'text', 'false', 'Member name assigned to this task', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'due_date', 'date', 'false', 'Task due date');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'tags', 'text[]', 'false', 'Task tags for categorization');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('tasks', 'estimated_hours', 'integer', 'false', 'Estimated hours to complete', 0, 1000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'completed_at', 'timestamp', 'false', 'Timestamp when task was completed');

-- Sample data for projects and tasks
-- References workspaces created in 01-workspaces-teams.sql

-- Insert projects and tasks
WITH inserted_projects AS (
  INSERT INTO projects (workspace_id, name, description, status, start_date, end_date, owner, tags, created_at)
  SELECT
    w.id,
    p.name,
    p.description,
    p.status,
    (w.created_at + (p.start_days || ' days')::interval)::date,
    CASE WHEN p.end_days IS NOT NULL THEN (w.created_at + (p.end_days || ' days')::interval)::date ELSE NULL END,
    p.owner,
    p.tags,
    w.created_at + (p.start_days || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('Q4 Platform Redesign', 'Complete redesign of platform UI/UX', 'active', '30', '120', 'Alice Johnson', ARRAY['frontend', 'design']),
      ('API v2 Migration', 'Migrate all services to API v2', 'active', '45', '150', 'Bob Martinez', ARRAY['backend', 'migration']),
      ('Security Audit', 'Comprehensive security review and improvements', 'completed', '60', '90', 'Carol Zhang', ARRAY['security', 'audit'])
  ) AS p(name, description, status, start_days, end_days, owner, tags)
  WHERE w.slug IN ('acme-corp', 'techstart-labs', 'devtools-inc')
  LIMIT 12

  RETURNING id, workspace_id, name, created_at
)
-- Insert tasks for projects
INSERT INTO tasks (project_id, title, description, status, priority, assignee, due_date, tags, estimated_hours, completed_at, created_at, updated_at)
SELECT
  ip.id,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.assignee,
  CASE WHEN t.due_days IS NOT NULL THEN (ip.created_at + (t.due_days || ' days')::interval)::date ELSE NULL END,
  t.tags,
  t.estimated_hours,
  CASE WHEN t.status = 'done' THEN ip.created_at + (t.due_days || ' days')::interval - interval '2 days' ELSE NULL END,
  ip.created_at + (t.start_days || ' days')::interval,
  ip.created_at + (t.start_days || ' days')::interval + interval '3 days'
FROM inserted_projects ip
CROSS JOIN LATERAL (
  VALUES
    ('Design new navigation system', 'Create mockups for improved navigation', 'done', 'high', 'Frank Chen', '7', ARRAY['design', 'ui'], 16, '2'),
    ('Implement navigation components', 'Build React components for new navigation', 'in_progress', 'high', 'Grace Park', '14', ARRAY['frontend', 'react'], 24, '5'),
    ('Write unit tests', 'Add test coverage for new components', 'todo', 'medium', 'Henry Thompson', '21', ARRAY['testing'], 8, '10'),
    ('Update documentation', 'Document new navigation patterns', 'todo', 'low', NULL, '28', ARRAY['docs'], 4, '15'),
    ('Performance testing', 'Load test new navigation system', 'blocked', 'medium', 'Iris Patel', NULL, ARRAY['testing', 'performance'], 12, '20')
  ) AS t(title, description, status, priority, assignee, due_days, tags, estimated_hours, start_days)
LIMIT 70;

-- Insert some standalone tasks (no project)
INSERT INTO tasks (project_id, title, description, status, priority, assignee, due_date, tags, estimated_hours, completed_at, created_at, updated_at)
VALUES
  (NULL, 'Review security patches', 'Review and apply latest security updates', 'todo', 'high', 'Alice Johnson', (now() + interval '3 days')::date, ARRAY['security', 'maintenance'], 4, NULL, now() - interval '2 days', now()),
  (NULL, 'Update team onboarding docs', 'Refresh onboarding documentation for new hires', 'in_progress', 'low', 'Bob Martinez', (now() + interval '7 days')::date, ARRAY['docs', 'hr'], 8, NULL, now() - interval '5 days', now() - interval '1 day'),
  (NULL, 'Schedule quarterly planning', 'Organize Q1 planning sessions', 'done', 'medium', 'Carol Zhang', (now() - interval '2 days')::date, ARRAY['planning', 'management'], 2, now() - interval '3 days', now() - interval '10 days', now() - interval '3 days');

-- END: data/05-projects-tasks.sql
-- BEGIN: data/06-conversations-messages.sql
-- ============================================================================
-- DATA: Conversations and Messages model registration and sample data
-- ============================================================================

-- Register conversations model
INSERT INTO "models" (model_name, status, description)
  VALUES ('conversations', 'active', 'LLM conversation history with searchable context');

-- Register conversations fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('conversations', 'title', 'text', 'true', 'Conversation title', 2, 200);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'context_tags', 'text[]', 'false', 'Tags for semantic search and categorization');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'participants', 'text[]', 'false', 'List of participant names');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('conversations', 'summary', 'text', 'false', 'Auto-generated or manual conversation summary', 2000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'metadata', 'jsonb', 'false', 'LLM metadata (model info, token counts, embeddings reference, conversation type)');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'started_at', 'timestamp', 'false', 'Timestamp when conversation started');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'last_message_at', 'timestamp', 'false', 'Timestamp of most recent message');

-- Register messages model
INSERT INTO "models" (model_name, status, description)
  VALUES ('messages', 'active', 'Individual messages within conversations');

-- Register messages fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('messages', 'conversation_id', 'uuid', 'true', 'Foreign key to conversations table');

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('messages', 'role', 'text', 'true', 'Message role', ARRAY['user', 'assistant', 'system', 'tool']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('messages', 'content', 'text', 'true', 'Message content (can be large)', 50000);

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('messages', 'tokens', 'integer', 'false', 'Token count for this message', 0, 100000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('messages', 'metadata', 'jsonb', 'false', 'Message metadata (function calls, code blocks, attachments, reasoning traces)');

-- Sample data for conversations and messages (LLM memory)
-- References workspaces created in 01-workspaces-teams.sql

-- Insert conversations and messages
WITH inserted_conversations AS (
  INSERT INTO conversations (workspace_id, title, context_tags, participants, summary, metadata, started_at, last_message_at)
  SELECT
    w.id,
    c.title,
    c.context_tags,
    c.participants,
    c.summary,
    c.metadata::jsonb,
    w.created_at + (c.start_days || ' days')::interval,
    w.created_at + (c.start_days || ' days')::interval + (c.duration_days || ' hours')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('API Design Discussion: Authentication Flow', ARRAY['api-design', 'authentication', 'security'], ARRAY['Alice Johnson', 'Claude', 'Bob Martinez'],
       'Discussion about implementing OAuth2 with JWT tokens for the new API',
       '{"model": "claude-3-opus", "total_tokens": 2847, "conversation_type": "technical-discussion"}', '35', '4'),
      ('Debugging Session: Memory Leak Investigation', ARRAY['debugging', 'performance', 'memory'], ARRAY['David Kumar', 'Claude'],
       'Troubleshooting memory leak in background sync process',
       '{"model": "claude-3-sonnet", "total_tokens": 5234, "conversation_type": "debugging"}', '50', '2'),
      ('Code Review: New Navigation Component', ARRAY['code-review', 'frontend', 'react'], ARRAY['Grace Park', 'Claude', 'Frank Chen'],
       'Reviewing React component implementation for new navigation system',
       '{"model": "claude-3-haiku", "total_tokens": 1523, "conversation_type": "code-review"}', '65', '1')
  ) AS c(title, context_tags, participants, summary, metadata, start_days, duration_days)
  WHERE w.slug IN ('acme-corp', 'techstart-labs', 'devtools-inc')
  LIMIT 25

  RETURNING id, workspace_id, title, started_at
)
-- Insert messages for conversations
INSERT INTO messages (conversation_id, role, content, tokens, metadata, created_at)
SELECT
  ic.id,
  m.role,
  m.content,
  m.tokens,
  m.metadata::jsonb,
  ic.started_at + (m.order_seq || ' minutes')::interval
FROM inserted_conversations ic
CROSS JOIN LATERAL (
  VALUES
    ('user', 'We need to implement OAuth2 for the new API. What''s the best approach for token refresh?', 127, '{"intent": "question"}', '0'),
    ('assistant', 'For OAuth2 token refresh, I recommend implementing a refresh token rotation strategy. Here''s why:\n\n1. Security: Each refresh generates a new refresh token\n2. Detection: Enables detection of token theft\n3. Compliance: Meets OWASP recommendations\n\nImplementation approach:\n- Store refresh tokens in secure HttpOnly cookies\n- Implement automatic token refresh 5 minutes before expiry\n- Add retry logic for failed refreshes', 412, '{"code_blocks": 0, "recommendations": 3}', '2'),
    ('user', 'That makes sense. Should we use separate databases for token storage?', 89, '{"intent": "clarification"}', '5'),
    ('assistant', 'For your scale, I''d recommend keeping tokens in the same database but in a separate table with:\n\n- TTL-based cleanup (automatic expiration)\n- Indexed by user_id for fast lookups\n- Encrypted refresh token values\n\nThis simplifies your infrastructure while maintaining security.', 298, '{"recommendations": 3}', '7')
  ) AS m(role, content, tokens, metadata, order_seq)
WHERE ic.title LIKE '%API Design%'

UNION ALL

SELECT ic.id, m.role, m.content, m.tokens, m.metadata::jsonb, ic.started_at + (m.order_seq || ' minutes')::interval
FROM inserted_conversations ic
CROSS JOIN LATERAL (
  VALUES
    ('user', 'The background sync process is consuming 2GB of memory after running for 6 hours. Can you help debug this?', 156, '{"intent": "problem-report", "attachments": ["memory-profile.png"]}', '0'),
    ('assistant', 'Let''s analyze the memory leak systematically:\n\n1. Check for event listener leaks\n2. Inspect closure references\n3. Review timer cleanup\n4. Check for large data structures accumulating\n\nCan you share the sync process code?', 234, '{"checklist_items": 4}', '3'),
    ('user', 'Here''s the sync code: [code snippet]. I notice we''re adding event listeners in a loop without removing them.', 178, '{"code_blocks": 1, "discovery": "event-listeners"}', '8'),
    ('assistant', 'Excellent catch! The issue is on line 45 - you''re adding listeners in the loop without cleanup. Solution:\n\n```javascript\nconst listener = () => handleUpdate(item);\nitem.addEventListener(''update'', listener);\n// Store reference for cleanup\nlistenerMap.set(item.id, listener);\n```\n\nThen add cleanup in your shutdown handler.', 387, '{"code_blocks": 1, "solution_provided": true}', '12')
  ) AS m(role, content, tokens, metadata, order_seq)
WHERE ic.title LIKE '%Debugging%'

UNION ALL

SELECT ic.id, m.role, m.content, m.tokens, m.metadata::jsonb, ic.started_at + (m.order_seq || ' minutes')::interval
FROM inserted_conversations ic
CROSS JOIN LATERAL (
  VALUES
    ('user', 'Can you review this navigation component implementation?', 89, '{"intent": "code-review", "files": ["Navigation.tsx"]}', '0'),
    ('assistant', 'I''ve reviewed the Navigation component. Overall structure is good! A few suggestions:\n\n1. Extract navigation items to a config file\n2. Add keyboard navigation support\n3. Consider memoizing the navigation items\n4. Add loading states for async menu items\n\nThe accessibility attributes look great.', 312, '{"suggestions": 4, "praise": true}', '4'),
    ('user', 'Good points. How should I implement keyboard navigation?', 67, '{"intent": "implementation-question"}', '7'),
    ('assistant', 'For keyboard navigation, add these handlers:\n\n```tsx\nconst handleKeyDown = (e: KeyboardEvent) => {\n  switch(e.key) {\n    case ''ArrowRight'': focusNext(); break;\n    case ''ArrowLeft'': focusPrev(); break;\n    case ''Enter'': activateItem(); break;\n  }\n};\n```\n\nDon''t forget to manage focus with useRef and add tabIndex={0} to focusable items.', 445, '{"code_blocks": 1, "implementation_details": true}', '10')
  ) AS m(role, content, tokens, metadata, order_seq)
WHERE ic.title LIKE '%Code Review%';

-- END: data/06-conversations-messages.sql
-- BEGIN: data/07-docs.sql
-- ============================================================================
-- DATA: Docs model registration and sample data
-- ============================================================================

-- Register docs model
INSERT INTO "models" (model_name, status, description)
  VALUES ('docs', 'active', 'Large text documentation with full-text search capabilities');

-- Register docs fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('docs', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('docs', 'title', 'text', 'true', 'Document title', 2, 200);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('docs', 'content', 'text', 'true', 'Large text content (2KB-50KB, markdown or plain text)', 100000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('docs', 'content_type', 'text', 'false', 'Content type/format', ARRAY['markdown', 'plaintext', 'code', 'adr', 'api-spec']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('docs', 'tags', 'text[]', 'false', 'Document tags for categorization');

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('docs', 'category', 'text', 'false', 'Document category', ARRAY['reference', 'guide', 'adr', 'runbook', 'architecture', 'tutorial']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('docs', 'author', 'text', 'false', 'Document author name', 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('docs', 'version', 'text', 'false', 'Document version', 50);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('docs', 'metadata', 'jsonb', 'false', 'Document metadata (related_docs, embedding_id, word_count, last_indexed_at)');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('docs', 'accessed_at', 'timestamp', 'false', 'Timestamp when document was last accessed (for LRU/popularity tracking)');

-- Sample data for docs (large text documentation)
-- References workspaces created in 01-workspaces-teams.sql

INSERT INTO docs (workspace_id, title, content, content_type, tags, category, author, version, metadata, created_at, updated_at, accessed_at)
SELECT
  w.id,
  d.title,
  d.content,
  d.content_type,
  d.tags,
  d.category,
  d.author,
  d.version,
  d.metadata::jsonb,
  w.created_at + (d.days_after || ' days')::interval,
  w.created_at + (d.days_after || ' days')::interval + (d.days_since_update || ' days')::interval,
  now() - (d.days_since_access || ' days')::interval
FROM workspaces w
CROSS JOIN LATERAL (
  VALUES
    ('API Authentication Guide',
E'# API Authentication Guide\n\n## Overview\n\nThis document describes the authentication and authorization mechanisms for the Acme API platform. Our API uses OAuth 2.0 with JWT tokens for secure authentication.\n\n## Authentication Flow\n\n### 1. Obtain Access Token\n\nTo authenticate, send a POST request to `/auth/token`:\n\n```bash\ncurl -X POST https://api.acme-corp.com/auth/token \\\n  -H "Content-Type: application/json" \\\n  -d ''{\n    "client_id": "your_client_id",\n    "client_secret": "your_client_secret",\n    "grant_type": "client_credentials"\n  }''\n```\n\n### 2. Use Access Token\n\nInclude the access token in the Authorization header:\n\n```bash\ncurl -X GET https://api.acme-corp.com/v1/users \\\n  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"\n```\n\n## Token Refresh\n\nAccess tokens expire after 1 hour. Use refresh tokens to obtain new access tokens:\n\n```bash\ncurl -X POST https://api.acme-corp.com/auth/refresh \\\n  -H "Content-Type: application/json" \\\n  -d ''{"refresh_token": "YOUR_REFRESH_TOKEN"}''\n```\n\n## Security Best Practices\n\n1. **Never expose tokens**: Store tokens securely, never in client-side code\n2. **Use HTTPS**: Always use HTTPS for API requests\n3. **Rotate secrets**: Regularly rotate client secrets\n4. **Implement rate limiting**: Protect against brute force attacks\n5. **Monitor usage**: Track API usage for anomalies\n\n## Error Handling\n\n### 401 Unauthorized\n\nToken is missing, expired, or invalid. Refresh your token or re-authenticate.\n\n### 403 Forbidden\n\nToken is valid but lacks required permissions.\n\n### 429 Rate Limit Exceeded\n\nToo many requests. Implement exponential backoff.\n\n## Rate Limits\n\n- Standard tier: 1000 requests/hour\n- Premium tier: 10000 requests/hour\n- Enterprise: Custom limits\n\nRate limit headers:\n```\nX-RateLimit-Limit: 1000\nX-RateLimit-Remaining: 999\nX-RateLimit-Reset: 1640995200\n```',
    'markdown', ARRAY['api', 'authentication', 'oauth'], 'reference', 'Alice Johnson', '2.1.0',
    '{"word_count": 425, "last_reviewed": "2024-11-01", "related_docs": ["api-quickstart", "security-policy"]}',
    '40', '15', '2'),

    ('Architecture Decision Record: Database Sharding',
E'# ADR-003: Implement Database Sharding Strategy\n\n## Status\n\nAccepted\n\n## Context\n\nOur user base has grown to 500K+ active users, and our monolithic PostgreSQL database is showing performance degradation:\n\n- Query latency increased 300% over 6 months\n- Write operations are becoming bottlenecked\n- Backup/restore windows exceed acceptable limits\n- Single point of failure concerns\n\n## Decision\n\nWe will implement horizontal database sharding with the following approach:\n\n### Sharding Strategy\n\n**Hash-based sharding on user_id**\n\n- Shard count: 16 initial shards (expandable to 64)\n- Shard key: MD5(user_id) % shard_count\n- Technology: PostgreSQL 15+ with Citus extension\n\n### Data Distribution\n\n```sql\n-- Example sharding function\nCREATE FUNCTION get_shard_id(user_id UUID) \nRETURNS INTEGER AS $$\nBEGIN\n  RETURN (''x'' || substring(md5(user_id::text), 1, 8))::bit(32)::int % 16;\nEND;\n$$ LANGUAGE plpgsql IMMUTABLE;\n```\n\n### Migration Plan\n\n1. **Phase 1**: Set up shard infrastructure (2 weeks)\n2. **Phase 2**: Implement application-layer sharding logic (3 weeks)\n3. **Phase 3**: Gradual data migration (4 weeks)\n4. **Phase 4**: Cutover and monitoring (1 week)\n\n## Consequences\n\n### Positive\n\n- **Performance**: 10x improvement in write throughput\n- **Scalability**: Linear scaling to 5M+ users\n- **Availability**: Shard-level isolation limits blast radius\n- **Backup efficiency**: Parallel backups reduce window to 30 minutes\n\n### Negative\n\n- **Complexity**: Application code must be shard-aware\n- **Cross-shard queries**: Expensive operations require scatter-gather\n- **Rebalancing**: Moving users between shards is complex\n- **Operational overhead**: Managing 16+ databases\n\n### Mitigation Strategies\n\n1. **Abstraction layer**: Create ShardingService to hide complexity\n2. **Caching**: Implement Redis caching for cross-shard data\n3. **Monitoring**: Comprehensive metrics for each shard\n4. **Documentation**: Detailed runbooks for operations team\n\n## Alternatives Considered\n\n### 1. Vertical Scaling\n\n- **Rejected**: Hitting hardware limits, diminishing returns\n- Cost: $50K/month for larger instance\n- Scalability ceiling: 2M users max\n\n### 2. Read Replicas\n\n- **Rejected**: Doesn''t solve write bottleneck\n- Only improves read performance\n- Replication lag introduces complexity\n\n### 3. NewSQL Databases (CockroachDB, TiDB)\n\n- **Rejected**: Too risky to migrate entire stack\n- Team lacks expertise\n- PostgreSQL compatibility concerns\n\n## References\n\n- [Instagram Engineering: Sharding](https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c)\n- [Notion''s Sharding Journey](https://www.notion.so/blog/sharding)\n- [PostgreSQL Sharding with Citus](https://docs.citusdata.com/)',
    'markdown', ARRAY['architecture', 'database', 'sharding', 'scalability'], 'adr', 'Bob Martinez', '1.0.0',
    '{"stakeholders": ["Alice Johnson", "Bob Martinez", "Carol Zhang"], "review_date": "2024-10-15", "implementation_status": "in-progress"}',
    '55', '10', '5'),

    ('Team Onboarding Runbook',
E'# New Team Member Onboarding\n\n## Pre-arrival (1 week before)\n\n### IT Setup\n\n- [ ] Create email account\n- [ ] Provision laptop (MacBook Pro M3)\n- [ ] Set up VPN access\n- [ ] Add to GitHub organization\n- [ ] Add to Slack workspace\n- [ ] Provision development environment\n\n### Access Requests\n\n```bash\n# Submit access request\n./scripts/create-user.sh --email new.hire@company.com --role engineer\n\n# Verify access\n./scripts/verify-access.sh --email new.hire@company.com\n```\n\n## Day 1\n\n### Morning (9:00 AM - 12:00 PM)\n\n**9:00 - 9:30**: Welcome meeting with manager\n- Team introduction\n- Review first week schedule\n- Q&A\n\n**9:30 - 10:30**: IT setup\n- Laptop configuration\n- Install required software:\n  - VS Code\n  - Docker Desktop\n  - Node.js 20+\n  - PostgreSQL client\n\n**10:30 - 12:00**: Codebase walkthrough\n- Clone repositories\n- Run local development environment\n- Review architecture documentation\n\n### Afternoon (1:00 PM - 5:00 PM)\n\n**1:00 - 2:00**: Lunch with team\n\n**2:00 - 3:00**: Security & Compliance training\n- Security policies\n- Data handling guidelines\n- Incident response procedures\n\n**3:00 - 5:00**: First ticket\n- Pair programming session\n- Simple bug fix or documentation update\n\n## Week 1\n\n### Development Environment Setup\n\n```bash\n# Install dependencies\nnpm install\n\n# Configure environment\ncp .env.example .env\n# Edit .env with your settings\n\n# Run database migrations\nnpm run db:migrate\n\n# Start development server\nnpm run dev\n```\n\n### Key Resources\n\n- [Engineering Wiki](https://wiki.company.com)\n- [API Documentation](https://api-docs.company.com)\n- [Team Calendar](https://calendar.company.com)\n- [Incident Runbooks](https://runbooks.company.com)\n\n## Week 2-4\n\n- Shadow senior engineer (1 week)\n- Take on first medium-sized feature\n- Participate in code reviews\n- Present at team standup\n\n## 30-Day Check-in\n\nSchedule 1:1 with manager to discuss:\n- Progress and challenges\n- Learning goals\n- Team fit\n- Career development\n\n## Common Issues\n\n### VPN Connection Problems\n\n```bash\n# Reset VPN\nsudo killall openvpn\nsudo openvpn --config ~/vpn/company.ovpn\n```\n\n### Database Connection Failed\n\n1. Verify VPN is connected\n2. Check DATABASE_URL in .env\n3. Confirm firewall rules allow connection\n4. Contact #dev-ops if issue persists\n\n## Emergency Contacts\n\n- IT Support: it-support@company.com (Slack: #it-help)\n- Security: security@company.com\n- Manager: your.manager@company.com',
    'markdown', ARRAY['onboarding', 'hr', 'runbook'], 'runbook', 'Carol Zhang', '3.2.0',
    '{"last_onboarding_date": "2024-11-01", "success_rate": "95%", "avg_completion_days": 28}',
    '70', '5', '1')

  ) AS d(title, content, content_type, tags, category, author, version, metadata, days_after, days_since_update, days_since_access)
WHERE w.slug IN ('acme-corp', 'techstart-labs', 'devtools-inc', 'cloudscale', 'datapipe', 'secureauth')
LIMIT 35;

-- END: data/07-docs.sql

-- ECHO: '✓ Data loaded: 7 tables'
-- ECHO: ''

-- ECHO: '=========================================='
-- ECHO: '✓ Demo Fixture Loaded Successfully'
-- ECHO: '=========================================='
-- ECHO: ''

COMMIT;

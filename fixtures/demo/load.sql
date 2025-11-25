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

\echo ''
\echo '=========================================='
\echo 'Loading Demo Fixture'
\echo '=========================================='
\echo ''

-- Phase 1: Model definitions (ordered by foreign key dependencies)
\echo '→ Phase 1: Model definitions'

-- Base models (no dependencies)
\ir describe/workspaces.sql
\ir describe/teams.sql

-- Member model (depends on workspaces, teams)
\ir describe/members.sql

-- Repository models (depend on workspaces)
\ir describe/repositories.sql
\ir describe/releases.sql

-- Project and task models (depend on workspaces, repositories)
\ir describe/projects.sql
\ir describe/tasks.sql

-- Issue models (depend on repositories)
\ir describe/issues.sql
\ir describe/issue_comments.sql

-- Communication models (depend on workspaces, members)
\ir describe/conversations.sql
\ir describe/messages.sql

-- Documentation model (depends on workspaces)
\ir describe/docs.sql

\echo '✓ Models loaded: 12'
\echo ''

-- Phase 2: Sample data (numbered for dependency order)
\echo '→ Phase 2: Sample data'

\ir data/01-workspaces-teams.sql
\ir data/02-members.sql
\ir data/03-repositories-releases.sql
\ir data/04-issues-comments.sql
\ir data/05-projects-tasks.sql
\ir data/06-conversations-messages.sql
\ir data/07-docs.sql

\echo '✓ Data loaded: 7 tables'
\echo ''

\echo '=========================================='
\echo '✓ Demo Fixture Loaded Successfully'
\echo '=========================================='
\echo ''

-- ============================================================================
-- SCHEMA: history
-- ============================================================================
-- Change tracking / audit trail table
-- Created via create_table_from_schema() function using column definitions

-- NOTE: The actual CREATE TABLE happens in data/history.sql via the function
-- This file just documents that history is a dynamically created table

-- The history table will be created with these columns (defined in data/columns.sql):
-- - change_id (bigserial) - Auto-incrementing change identifier
-- - schema_name (text) - Schema where change occurred
-- - record_id (uuid) - Record that was changed
-- - operation (text) - create, update, or delete
-- - changes (jsonb) - Field-level changes with old/new values
-- - created_by (uuid) - User who made the change
-- - request_id (text) - Request correlation ID
-- - metadata (jsonb) - Additional context (IP, user agent, etc.)

-- Plus standard system fields:
-- - id, access_*, created_at, updated_at, trashed_at, deleted_at

-- Composite index for efficient history queries
CREATE INDEX idx_history_schema_record ON history(schema_name, record_id, change_id DESC);

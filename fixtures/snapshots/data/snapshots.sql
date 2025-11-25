-- ============================================================================
-- DATA: Snapshots model registration
-- ============================================================================

-- Register snapshots model
INSERT INTO "models" (model_name, status, sudo)
VALUES ('snapshots', 'system', true);

-- ============================================================================
-- FIELDS FOR: snapshots
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('snapshots', 'name', 'text', true, 'Snapshot identifier'),
    ('snapshots', 'database', 'text', true, 'PostgreSQL database name (format: snapshot_{random})'),
    ('snapshots', 'description', 'text', false, 'Optional description of snapshot purpose'),
    ('snapshots', 'status', 'text', true, 'Processing status: pending, processing, active, failed'),
    ('snapshots', 'snapshot_type', 'text', true, 'Type: manual, auto, pre_migration, scheduled'),
    ('snapshots', 'size_bytes', 'bigint', false, 'Snapshot database size in bytes'),
    ('snapshots', 'record_count', 'integer', false, 'Total records at snapshot time'),
    ('snapshots', 'error_message', 'text', false, 'Error details if status is failed'),
    ('snapshots', 'created_by', 'uuid', true, 'User who created the snapshot'),
    ('snapshots', 'expires_at', 'timestamp', false, 'Retention policy expiration time');

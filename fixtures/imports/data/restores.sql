-- ============================================================================
-- DATA: Register restore models and define fields
-- ============================================================================

-- Register restores model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'restores',
    'system',
    false,
    'Data restoration and import job configurations'
);

-- Register restore_runs model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'restore_runs',
    'system',
    false,
    'Individual execution runs of restore jobs'
);

-- Register restore_logs model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'restore_logs',
    'system',
    false,
    'Detailed logs from restore operations'
);

-- ============================================================================
-- FIELDS FOR: restores
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('restores', 'name', 'text', true, 'Human-readable name for this restore'),
    ('restores', 'description', 'text', false, 'Purpose and notes'),
    ('restores', 'source_type', 'text', true, 'Source type: upload, extract_run, url'),
    ('restores', 'source_ref', 'text', false, 'Reference to source (file path, run ID, or URL)'),
    ('restores', 'conflict_strategy', 'text', true, 'How to handle conflicts: replace, upsert, merge, sync, skip, error'),
    ('restores', 'include', 'text[]', false, 'What to restore: describe, data'),
    ('restores', 'models', 'text[]', false, 'Specific models to restore (null = all)'),
    ('restores', 'create_models', 'boolean', false, 'Allow creating new models'),
    ('restores', 'enabled', 'boolean', false, 'Can this restore be executed'),
    ('restores', 'last_run_id', 'uuid', false, 'Most recent execution'),
    ('restores', 'last_run_at', 'timestamp', false, 'When last executed'),
    ('restores', 'total_runs', 'integer', false, 'Total execution count'),
    ('restores', 'successful_runs', 'integer', false, 'Successful execution count'),
    ('restores', 'failed_runs', 'integer', false, 'Failed execution count');

-- ============================================================================
-- FIELDS FOR: restore_runs
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('restore_runs', 'restore_id', 'uuid', false, 'Foreign key to restores table (null for direct imports)'),
    ('restore_runs', 'restore_name', 'text', false, 'Denormalized for easier queries'),
    ('restore_runs', 'source_filename', 'text', false, 'Original filename of uploaded file'),
    ('restore_runs', 'status', 'text', true, 'Execution status: pending, queued, running, completed, failed, cancelled'),
    ('restore_runs', 'progress', 'integer', false, 'Completion percentage (0-100)'),
    ('restore_runs', 'progress_detail', 'jsonb', false, 'Detailed progress information'),
    ('restore_runs', 'started_at', 'timestamp', false, 'When execution began'),
    ('restore_runs', 'completed_at', 'timestamp', false, 'When execution finished'),
    ('restore_runs', 'duration_seconds', 'integer', false, 'Execution time in seconds'),
    ('restore_runs', 'records_imported', 'integer', false, 'Total records imported'),
    ('restore_runs', 'records_skipped', 'integer', false, 'Total records skipped'),
    ('restore_runs', 'records_updated', 'integer', false, 'Total records updated'),
    ('restore_runs', 'models_created', 'integer', false, 'Number of models created'),
    ('restore_runs', 'fields_created', 'integer', false, 'Number of fields created'),
    ('restore_runs', 'error', 'text', false, 'Error message if failed'),
    ('restore_runs', 'error_detail', 'text', false, 'Detailed error context'),
    ('restore_runs', 'config_snapshot', 'jsonb', false, 'Copy of restore config at execution time');

-- ============================================================================
-- FIELDS FOR: restore_logs
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('restore_logs', 'run_id', 'uuid', true, 'Foreign key to restore_runs table'),
    ('restore_logs', 'level', 'text', true, 'Log level: info, warn, error'),
    ('restore_logs', 'phase', 'text', false, 'Execution phase: upload, validation, describe_import, data_import'),
    ('restore_logs', 'model_name', 'text', false, 'Model being processed'),
    ('restore_logs', 'record_id', 'text', false, 'Record being processed'),
    ('restore_logs', 'message', 'text', true, 'Log message'),
    ('restore_logs', 'detail', 'jsonb', false, 'Additional context');

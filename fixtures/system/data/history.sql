-- ============================================================================
-- DATA: History model registration
-- ============================================================================

-- Register history model
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'history',
    'system',
    true,
    'Change tracking and audit trail'
);

-- ============================================================================
-- FIELDS FOR: history
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('history', 'change_id', 'bigserial', true, 'Auto-incrementing change identifier for ordering'),
    ('history', 'model_name', 'text', true, 'Name of the model where the change occurred'),
    ('history', 'record_id', 'uuid', true, 'ID of the record that was changed'),
    ('history', 'operation', 'text', true, 'Operation type: create, update, or delete'),
    ('history', 'changes', 'jsonb', true, 'Field-level changes with old and new values'),
    ('history', 'created_by', 'uuid', false, 'ID of the user who made the change'),
    ('history', 'request_id', 'text', false, 'Request correlation ID for tracing'),
    ('history', 'metadata', 'jsonb', false, 'Additional context (IP address, user agent, etc.)');

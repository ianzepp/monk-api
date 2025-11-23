-- ============================================================================
-- DATA: Models model registration
-- ============================================================================
-- Register the models table itself in the models registry
-- This enables recursive model discovery via the Data API

INSERT INTO "models" (model_name, status, sudo)
VALUES ('models', 'system', true);

-- ============================================================================
-- FIELDS FOR: models
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, default_value, description) VALUES
    ('models', 'model_name', 'text', true, NULL, 'Unique name for the model'),
    ('models', 'status', 'text', false, 'active', 'Model status (active, disabled, system)'),
    ('models', 'description', 'text', false, NULL, 'Human-readable description of the model'),
    ('models', 'sudo', 'boolean', false, NULL, 'Whether model modifications require sudo access'),
    ('models', 'frozen', 'boolean', false, NULL, 'Whether all data changes are prevented on this model'),
    ('models', 'immutable', 'boolean', false, NULL, 'Whether records are write-once (can be created but never modified)'),
    ('models', 'external', 'boolean', false, NULL, 'Whether model is managed externally (skip DDL operations)');

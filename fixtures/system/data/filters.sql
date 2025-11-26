-- ============================================================================
-- DATA: Filters model registration
-- ============================================================================
-- Register the filters table for saved filter definitions

INSERT INTO "models" (model_name, status, description)
VALUES ('filters', 'system', 'Saved filter definitions for the Find API');

-- ============================================================================
-- FIELDS FOR: filters
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('filters', 'name', 'text', true, 'Unique name for this saved filter within the model'),
    ('filters', 'model_name', 'text', true, 'Target model this filter executes against'),
    ('filters', 'description', 'text', false, 'Human-readable description of the filter'),
    ('filters', 'select', 'jsonb', false, 'Fields to return (array of field names)'),
    ('filters', 'where', 'jsonb', false, 'Filter conditions'),
    ('filters', 'order', 'jsonb', false, 'Sort order (array of "field asc/desc" strings)'),
    ('filters', 'limit', 'integer', false, 'Maximum records to return'),
    ('filters', 'offset', 'integer', false, 'Number of records to skip');

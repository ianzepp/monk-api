-- ============================================================================
-- DATA: Register grids model and define fields
-- ============================================================================

-- Register grids model
INSERT INTO "models" (model_name, status, external, description)
VALUES (
    'grids',
    'system',
    false,
    'Grid metadata storage for Grid API'
);

-- ============================================================================
-- FIELDS FOR: grids
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, default_value, description) VALUES
    ('grids', 'name', 'text', true, NULL, 'Human-readable name for this grid'),
    ('grids', 'description', 'text', false, NULL, 'Purpose and notes'),
    ('grids', 'row_count', 'integer', false, NULL, 'Current number of rows with data'),
    ('grids', 'row_max', 'integer', false, 1000, 'Maximum number of rows allowed'),
    ('grids', 'col_max', 'text', false, 'Z', 'Maximum field letter allowed');

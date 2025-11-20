-- ============================================================================
-- DATA: Register grids schema and define columns
-- ============================================================================

-- Register grids schema
INSERT INTO "schemas" (schema_name, status, external, description)
VALUES (
    'grids',
    'system',
    false,
    'Grid metadata storage for Grid API'
);

-- ============================================================================
-- COLUMNS FOR: grids
-- ============================================================================
INSERT INTO "columns" (schema_name, column_name, type, required, default_value, description) VALUES
    ('grids', 'name', 'text', true, NULL, 'Human-readable name for this grid'),
    ('grids', 'description', 'text', false, NULL, 'Purpose and notes'),
    ('grids', 'row_count', 'integer', false, NULL, 'Current number of rows with data'),
    ('grids', 'row_max', 'integer', false, 1000, 'Maximum number of rows allowed'),
    ('grids', 'col_max', 'text', false, 'Z', 'Maximum column letter allowed');

-- ============================================================================
-- Generate JSON Schema definition
-- ============================================================================
SELECT regenerate_schema_definition('grids');

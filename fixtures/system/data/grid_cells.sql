-- ============================================================================
-- DATA: Register grid_cells schema and define columns
-- ============================================================================

-- Register grid_cells schema (external - managed by Grid API)
INSERT INTO "schemas" (schema_name, status, external, description)
VALUES (
    'grid_cells',
    'system',
    true,
    'Grid cell storage - external schema managed by Grid API'
);

-- ============================================================================
-- COLUMNS FOR: grid_cells
-- ============================================================================
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('grid_cells', 'grid_id', 'uuid', true, 'Foreign key to grids table'),
    ('grid_cells', 'row', 'integer', true, 'Row number (1-based)'),
    ('grid_cells', 'col', 'text', true, 'Column letter (A-Z)'),
    ('grid_cells', 'value', 'text', false, 'Cell value (stored as text)');

-- ============================================================================
-- Regenerate schema metadata
-- ============================================================================
SELECT regenerate_schema_definition('grid_cells');

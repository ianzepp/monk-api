-- ============================================================================
-- DATA: Register grid_cells model and define fields
-- ============================================================================

-- Register grid_cells model (external - managed by Grid API)
INSERT INTO "models" (model_name, status, external, description)
VALUES (
    'grid_cells',
    'system',
    true,
    'Grid cell storage - external model managed by Grid API'
);

-- ============================================================================
-- FIELDS FOR: grid_cells
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('grid_cells', 'grid_id', 'uuid', true, 'Foreign key to grids table'),
    ('grid_cells', 'row', 'integer', true, 'Row number (1-based)'),
    ('grid_cells', 'col', 'text', true, 'Field letter (A-Z)'),
    ('grid_cells', 'value', 'text', false, 'Cell value (stored as text)');

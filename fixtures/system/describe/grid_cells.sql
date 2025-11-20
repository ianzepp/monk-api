-- ============================================================================
-- SCHEMA: grid_cells (EXTERNAL)
-- ============================================================================
-- Grid cell storage - external schema managed by Grid API
-- Schema definition lives in system, but data is accessed via /api/grid/* only

-- 1. Insert schema/column metadata
INSERT INTO schemas (schema_name, external) VALUES ('grid_cells', true);
INSERT INTO columns (schema_name, column_name, type, required) VALUES
  ('grid_cells', 'grid_id', 'string', true),
  ('grid_cells', 'row', 'integer', true),
  ('grid_cells', 'col', 'string', true),
  ('grid_cells', 'value', 'string', false);

-- 2. Create the actual table (DDL runs after metadata insertion)
CREATE TABLE grid_cells (
  grid_id VARCHAR NOT NULL,
  row INTEGER NOT NULL,
  col CHAR(1) NOT NULL,
  value TEXT,

  PRIMARY KEY (grid_id, row, col),
  FOREIGN KEY (grid_id) REFERENCES grids(id) ON DELETE CASCADE
);

CREATE INDEX idx_grid_range ON grid_cells(grid_id, row, col);

COMMENT ON TABLE grid_cells IS 'Grid cell storage for Grid API (external schema - see /api/grid/*)';

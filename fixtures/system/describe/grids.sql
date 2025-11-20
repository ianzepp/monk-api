-- ============================================================================
-- SCHEMA: grids
-- ============================================================================
-- Grid metadata storage - regular schema managed via Data API

INSERT INTO schemas (schema_name, external) VALUES ('grids', false);
INSERT INTO columns (schema_name, column_name, type, required, default_value) VALUES
  ('grids', 'name', 'string', true, NULL),
  ('grids', 'description', 'string', false, NULL),
  ('grids', 'row_count', 'integer', false, NULL),
  ('grids', 'row_max', 'integer', false, 1000),
  ('grids', 'col_max', 'string', false, 'Z');

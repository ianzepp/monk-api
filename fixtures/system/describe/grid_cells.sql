-- ============================================================================
-- SCHEMA: grid_cells (EXTERNAL)
-- ============================================================================
-- Grid cell storage - external schema managed by Grid API
-- Schema definition lives in system, but data is accessed via /app/grids/* only

CREATE TABLE grid_cells (
	grid_id UUID NOT NULL,
	row INTEGER NOT NULL,
	col CHAR(1) NOT NULL,
	value TEXT,

	PRIMARY KEY (grid_id, row, col),
	FOREIGN KEY (grid_id) REFERENCES grids(id) ON DELETE CASCADE
);

CREATE INDEX idx_grid_range ON grid_cells(grid_id, row, col);

COMMENT ON TABLE grid_cells IS 'Grid cell storage for Grid API (external schema - see /app/grids/*)';

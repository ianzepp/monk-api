-- Schema definition for teams
-- Development teams and groups within workspaces

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('teams', 'active', 'Development teams and groups within workspaces');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('teams', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('teams', 'name', 'text', 'true', 'Team name', 2, 100);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('teams', 'description', 'text', 'false', 'Team description', 500);

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('teams', 'focus_area', 'text', 'false', 'Team focus area', ARRAY['backend', 'frontend', 'ai-ml', 'devops', 'design', 'product', 'data']);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('teams', 'created_at', 'timestamp', 'false', 'Timestamp when team was created');

-- Create the actual table from schema definition
SELECT create_table_from_schema('teams');

-- Add composite unique constraint (workspace_id, name) for scoped uniqueness
ALTER TABLE teams ADD CONSTRAINT teams_workspace_name_unique UNIQUE(workspace_id, name);

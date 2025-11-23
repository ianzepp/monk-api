-- Model definition for teams
-- Development teams and groups within workspaces

-- Insert model record
INSERT INTO models (model_name, status, description)
  VALUES ('teams', 'active', 'Development teams and groups within workspaces');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('teams', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('teams', 'name', 'text', 'true', 'Team name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('teams', 'description', 'text', 'false', 'Team description', 500);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('teams', 'focus_area', 'text', 'false', 'Team focus area', ARRAY['backend', 'frontend', 'ai-ml', 'devops', 'design', 'product', 'data']);

-- Create the actual table from model definition
SELECT create_table_from_model('teams');

-- Add composite unique constraint (workspace_id, name) for scoped uniqueness
ALTER TABLE teams ADD CONSTRAINT teams_workspace_name_unique UNIQUE(workspace_id, name);

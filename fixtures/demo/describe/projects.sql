-- Model definition for projects
-- Projects and initiatives within workspaces

-- Insert model record
INSERT INTO models (model_name, status, description)
  VALUES ('projects', 'active', 'Projects and initiatives within workspaces');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('projects', 'name', 'text', 'true', 'Project name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('projects', 'description', 'text', 'false', 'Project description', 2000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('projects', 'status', 'text', 'false', 'Project status', ARRAY['planning', 'active', 'on_hold', 'completed', 'cancelled']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'start_date', 'date', 'false', 'Project start date');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'end_date', 'date', 'false', 'Project end date');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('projects', 'owner', 'text', 'false', 'Project owner/lead name', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('projects', 'tags', 'text[]', 'false', 'Project tags for categorization');

-- Create the actual table from model definition
SELECT create_table_from_model('projects');

-- Add composite unique constraint (workspace_id, name) for scoped uniqueness
ALTER TABLE projects ADD CONSTRAINT projects_workspace_name_unique UNIQUE(workspace_id, name);

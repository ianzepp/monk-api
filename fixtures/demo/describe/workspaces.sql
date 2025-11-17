-- Schema definition for workspaces
-- Top-level organizational containers for multi-tenant simulation

-- Insert schema record
INSERT INTO schemas (schema_name, status)
  VALUES ('workspaces', 'active');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('workspaces', 'name', 'text', 'true', 'Organization name', 2, 100);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum, pattern, "unique")
  VALUES ('workspaces', 'slug', 'text', 'true', 'URL-friendly identifier (lowercase, alphanumeric, hyphens)', 100, '^[a-z0-9-]+$', 'true');

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('workspaces', 'description', 'text', 'false', 'Organization description', 500);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('workspaces', 'settings', 'jsonb', 'false', 'Workspace settings (theme, preferences, feature flags)');

-- Create the actual table from schema definition
SELECT create_table_from_schema('workspaces');

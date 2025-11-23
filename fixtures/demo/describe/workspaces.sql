-- Model definition for workspaces
-- Top-level organizational containers for multi-tenant simulation

-- Insert model record
INSERT INTO models (model_name, status)
  VALUES ('workspaces', 'active');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('workspaces', 'name', 'text', 'true', 'Organization name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum, pattern, "unique")
  VALUES ('workspaces', 'slug', 'text', 'true', 'URL-friendly identifier (lowercase, alphanumeric, hyphens)', 100, '^[a-z0-9-]+$', 'true');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('workspaces', 'description', 'text', 'false', 'Organization description', 500);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('workspaces', 'settings', 'jsonb', 'false', 'Workspace settings (theme, preferences, feature flags)');

-- Create the actual table from model definition
SELECT create_table_from_schema('workspaces');

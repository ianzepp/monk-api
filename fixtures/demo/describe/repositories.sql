-- Schema definition for repositories
-- Code repositories (management layer, not git internals)

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('repositories', 'active', 'Code repositories for project management');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('repositories', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('repositories', 'name', 'text', 'true', 'Repository name', 2, 100);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum, pattern)
  VALUES ('repositories', 'slug', 'text', 'true', 'URL-friendly identifier', 100, '^[a-z0-9-]+$');

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('repositories', 'description', 'text', 'false', 'Repository description', 1000);

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('repositories', 'visibility', 'text', 'false', 'Repository visibility', ARRAY['public', 'private', 'internal']);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('repositories', 'primary_language', 'text', 'false', 'Primary programming language', 50);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('repositories', 'topics', 'text[]', 'false', 'Repository topics/tags for categorization');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('repositories', 'stars', 'integer', 'false', 'Star count', 0, 999999);

-- Create the actual table from schema definition
SELECT create_table_from_schema('repositories');

-- Add composite unique constraint (workspace_id, slug) for scoped uniqueness
ALTER TABLE repositories ADD CONSTRAINT repositories_workspace_slug_unique UNIQUE(workspace_id, slug);

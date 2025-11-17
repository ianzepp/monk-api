-- Schema definition for releases
-- Software releases, tags, and versioning

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('releases', 'active', 'Software releases, tags, and versioning');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('releases', 'repository_id', 'uuid', 'true', 'Foreign key to repositories table');

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('releases', 'version', 'text', 'true', 'Semantic version number', 50);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('releases', 'name', 'text', 'false', 'Human-readable release name', 200);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('releases', 'description', 'text', 'false', 'Release notes and changelog', 10000);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('releases', 'tag', 'text', 'false', 'Git tag name', 100);

INSERT INTO columns (schema_name, column_name, type, required, description, default_value)
  VALUES ('releases', 'is_prerelease', 'boolean', 'false', 'Whether this is a prerelease version', 'false');

INSERT INTO columns (schema_name, column_name, type, required, description, default_value)
  VALUES ('releases', 'is_draft', 'boolean', 'false', 'Whether this is a draft release', 'false');

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('releases', 'published_by', 'text', 'false', 'Member name who published the release', 100);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('releases', 'published_at', 'timestamp', 'false', 'Timestamp when release was published');

-- Create the actual table from schema definition
SELECT create_table_from_schema('releases');

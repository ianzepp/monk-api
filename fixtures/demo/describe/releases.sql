-- Model definition for releases
-- Software releases, tags, and versioning

-- Insert model record
INSERT INTO models (model_name, status, description)
  VALUES ('releases', 'active', 'Software releases, tags, and versioning');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('releases', 'repository_id', 'uuid', 'true', 'Foreign key to repositories table');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'version', 'text', 'true', 'Semantic version number', 50);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'name', 'text', 'false', 'Human-readable release name', 200);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'description', 'text', 'false', 'Release notes and changelog', 10000);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'tag', 'text', 'false', 'Git tag name', 100);

INSERT INTO fields (model_name, field_name, type, required, description, default_value)
  VALUES ('releases', 'is_prerelease', 'boolean', 'false', 'Whether this is a prerelease version', 'false');

INSERT INTO fields (model_name, field_name, type, required, description, default_value)
  VALUES ('releases', 'is_draft', 'boolean', 'false', 'Whether this is a draft release', 'false');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('releases', 'published_by', 'text', 'false', 'Member name who published the release', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('releases', 'published_at', 'timestamp', 'false', 'Timestamp when release was published');

-- Create the actual table from model definition
SELECT create_table_from_schema('releases');

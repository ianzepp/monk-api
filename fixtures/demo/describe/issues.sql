-- Schema definition for issues
-- Issue tracking and bug reports

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('issues', 'active', 'Issue tracking and bug reports');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('issues', 'repository_id', 'uuid', 'true', 'Foreign key to repositories table');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('issues', 'title', 'text', 'true', 'Issue title', 2, 200);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('issues', 'description', 'text', 'false', 'Detailed issue description', 10000);

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('issues', 'status', 'text', 'false', 'Issue status', ARRAY['open', 'in_progress', 'closed', 'wont_fix', 'duplicate']);

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('issues', 'priority', 'text', 'false', 'Issue priority', ARRAY['critical', 'high', 'medium', 'low']);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('issues', 'labels', 'text[]', 'false', 'Issue labels for categorization');

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('issues', 'assignee', 'text', 'false', 'Member name assigned to this issue', 100);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('issues', 'reported_by', 'text', 'false', 'Member name who reported the issue', 100);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('issues', 'created_at', 'timestamp', 'false', 'Timestamp when issue was created');

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('issues', 'updated_at', 'timestamp', 'false', 'Timestamp when issue was last updated');

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('issues', 'closed_at', 'timestamp', 'false', 'Timestamp when issue was closed');

-- Create the actual table from schema definition
SELECT create_table_from_schema('issues');

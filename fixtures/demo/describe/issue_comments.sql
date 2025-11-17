-- Schema definition for issue_comments
-- Comments and discussion on issues

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('issue_comments', 'active', 'Comments and discussion on issues');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('issue_comments', 'issue_id', 'uuid', 'true', 'Foreign key to issues table');

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('issue_comments', 'author', 'text', 'true', 'Comment author name', 100);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('issue_comments', 'body', 'text', 'true', 'Comment content', 5000);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('issue_comments', 'created_at', 'timestamp', 'false', 'Timestamp when comment was created');

-- Create the actual table from schema definition
SELECT create_table_from_schema('issue_comments');

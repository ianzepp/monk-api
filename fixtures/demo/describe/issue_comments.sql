-- Model definition for issue_comments
-- Comments and discussion on issues

-- Insert model record
INSERT INTO models (model_name, status, description)
  VALUES ('issue_comments', 'active', 'Comments and discussion on issues');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issue_comments', 'issue_id', 'uuid', 'true', 'Foreign key to issues table');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issue_comments', 'author', 'text', 'true', 'Comment author name', 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issue_comments', 'body', 'text', 'true', 'Comment content', 5000);

-- Create the actual table from model definition
SELECT create_table_from_model('issue_comments');

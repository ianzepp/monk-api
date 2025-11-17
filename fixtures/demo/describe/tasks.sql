-- Schema definition for tasks
-- Tasks, todos, and action items

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('tasks', 'active', 'Tasks, todos, and action items');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('tasks', 'project_id', 'uuid', 'false', 'Foreign key to projects table (nullable for standalone tasks)');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('tasks', 'title', 'text', 'true', 'Task title', 2, 200);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('tasks', 'description', 'text', 'false', 'Task description', 5000);

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('tasks', 'status', 'text', 'false', 'Task status', ARRAY['todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled']);

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('tasks', 'priority', 'text', 'false', 'Task priority', ARRAY['critical', 'high', 'medium', 'low']);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('tasks', 'assignee', 'text', 'false', 'Member name assigned to this task', 100);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('tasks', 'due_date', 'date', 'false', 'Task due date');

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('tasks', 'tags', 'text[]', 'false', 'Task tags for categorization');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('tasks', 'estimated_hours', 'integer', 'false', 'Estimated hours to complete', 0, 1000);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('tasks', 'completed_at', 'timestamp', 'false', 'Timestamp when task was completed');

-- Create the actual table from schema definition
SELECT create_table_from_schema('tasks');

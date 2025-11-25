-- ============================================================================
-- DATA: Projects and Tasks model registration and sample data
-- ============================================================================

-- Register projects model
INSERT INTO "models" (model_name, status, description)
  VALUES ('projects', 'active', 'Projects and initiatives within workspaces');

-- Register projects fields
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

-- Register tasks model
INSERT INTO "models" (model_name, status, description)
  VALUES ('tasks', 'active', 'Tasks, todos, and action items');

-- Register tasks fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'project_id', 'uuid', 'false', 'Foreign key to projects table (nullable for standalone tasks)');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('tasks', 'title', 'text', 'true', 'Task title', 2, 200);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('tasks', 'description', 'text', 'false', 'Task description', 5000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('tasks', 'status', 'text', 'false', 'Task status', ARRAY['todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled']);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('tasks', 'priority', 'text', 'false', 'Task priority', ARRAY['critical', 'high', 'medium', 'low']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('tasks', 'assignee', 'text', 'false', 'Member name assigned to this task', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'due_date', 'date', 'false', 'Task due date');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'tags', 'text[]', 'false', 'Task tags for categorization');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('tasks', 'estimated_hours', 'integer', 'false', 'Estimated hours to complete', 0, 1000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('tasks', 'completed_at', 'timestamp', 'false', 'Timestamp when task was completed');

-- Sample data for projects and tasks
-- References workspaces created in 01-workspaces-teams.sql

-- Insert projects and tasks
WITH inserted_projects AS (
  INSERT INTO projects (workspace_id, name, description, status, start_date, end_date, owner, tags, created_at)
  SELECT
    w.id,
    p.name,
    p.description,
    p.status,
    (w.created_at + (p.start_days || ' days')::interval)::date,
    CASE WHEN p.end_days IS NOT NULL THEN (w.created_at + (p.end_days || ' days')::interval)::date ELSE NULL END,
    p.owner,
    p.tags,
    w.created_at + (p.start_days || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('Q4 Platform Redesign', 'Complete redesign of platform UI/UX', 'active', '30', '120', 'Alice Johnson', ARRAY['frontend', 'design']),
      ('API v2 Migration', 'Migrate all services to API v2', 'active', '45', '150', 'Bob Martinez', ARRAY['backend', 'migration']),
      ('Security Audit', 'Comprehensive security review and improvements', 'completed', '60', '90', 'Carol Zhang', ARRAY['security', 'audit'])
  ) AS p(name, description, status, start_days, end_days, owner, tags)
  WHERE w.slug IN ('acme-corp', 'techstart-labs', 'devtools-inc')
  LIMIT 12

  RETURNING id, workspace_id, name, created_at
)
-- Insert tasks for projects
INSERT INTO tasks (project_id, title, description, status, priority, assignee, due_date, tags, estimated_hours, completed_at, created_at, updated_at)
SELECT
  ip.id,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.assignee,
  CASE WHEN t.due_days IS NOT NULL THEN (ip.created_at + (t.due_days || ' days')::interval)::date ELSE NULL END,
  t.tags,
  t.estimated_hours,
  CASE WHEN t.status = 'done' THEN ip.created_at + (t.due_days || ' days')::interval - interval '2 days' ELSE NULL END,
  ip.created_at + (t.start_days || ' days')::interval,
  ip.created_at + (t.start_days || ' days')::interval + interval '3 days'
FROM inserted_projects ip
CROSS JOIN LATERAL (
  VALUES
    ('Design new navigation system', 'Create mockups for improved navigation', 'done', 'high', 'Frank Chen', '7', ARRAY['design', 'ui'], 16, '2'),
    ('Implement navigation components', 'Build React components for new navigation', 'in_progress', 'high', 'Grace Park', '14', ARRAY['frontend', 'react'], 24, '5'),
    ('Write unit tests', 'Add test coverage for new components', 'todo', 'medium', 'Henry Thompson', '21', ARRAY['testing'], 8, '10'),
    ('Update documentation', 'Document new navigation patterns', 'todo', 'low', NULL, '28', ARRAY['docs'], 4, '15'),
    ('Performance testing', 'Load test new navigation system', 'blocked', 'medium', 'Iris Patel', NULL, ARRAY['testing', 'performance'], 12, '20')
  ) AS t(title, description, status, priority, assignee, due_days, tags, estimated_hours, start_days)
LIMIT 70;

-- Insert some standalone tasks (no project)
INSERT INTO tasks (project_id, title, description, status, priority, assignee, due_date, tags, estimated_hours, completed_at, created_at, updated_at)
VALUES
  (NULL, 'Review security patches', 'Review and apply latest security updates', 'todo', 'high', 'Alice Johnson', (now() + interval '3 days')::date, ARRAY['security', 'maintenance'], 4, NULL, now() - interval '2 days', now()),
  (NULL, 'Update team onboarding docs', 'Refresh onboarding documentation for new hires', 'in_progress', 'low', 'Bob Martinez', (now() + interval '7 days')::date, ARRAY['docs', 'hr'], 8, NULL, now() - interval '5 days', now() - interval '1 day'),
  (NULL, 'Schedule quarterly planning', 'Organize Q1 planning sessions', 'done', 'medium', 'Carol Zhang', (now() - interval '2 days')::date, ARRAY['planning', 'management'], 2, now() - interval '3 days', now() - interval '10 days', now() - interval '3 days');

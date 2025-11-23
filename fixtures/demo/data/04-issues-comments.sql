-- ============================================================================
-- DATA: Issues and Comments model registration and sample data
-- ============================================================================

-- Register issues model
INSERT INTO "models" (model_name, status, description)
  VALUES ('issues', 'active', 'Issue tracking and bug reports');

-- Register issues fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issues', 'repository_id', 'uuid', 'true', 'Foreign key to repositories table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('issues', 'title', 'text', 'true', 'Issue title', 2, 200);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issues', 'description', 'text', 'false', 'Detailed issue description', 10000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('issues', 'status', 'text', 'false', 'Issue status', ARRAY['open', 'in_progress', 'closed', 'wont_fix', 'duplicate']);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('issues', 'priority', 'text', 'false', 'Issue priority', ARRAY['critical', 'high', 'medium', 'low']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issues', 'labels', 'text[]', 'false', 'Issue labels for categorization');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issues', 'assignee', 'text', 'false', 'Member name assigned to this issue', 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issues', 'reported_by', 'text', 'false', 'Member name who reported the issue', 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issues', 'closed_at', 'timestamp', 'false', 'Timestamp when issue was closed');

-- Register issue_comments model
INSERT INTO "models" (model_name, status, description)
  VALUES ('issue_comments', 'active', 'Comments and discussion on issues');

-- Register issue_comments fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('issue_comments', 'issue_id', 'uuid', 'true', 'Foreign key to issues table');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issue_comments', 'author', 'text', 'true', 'Comment author name', 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('issue_comments', 'body', 'text', 'true', 'Comment content', 5000);

-- Sample data for issues and comments
-- References repositories created in 03-repositories-releases.sql

-- Insert issues
WITH inserted_issues AS (
  INSERT INTO issues (repository_id, title, description, status, priority, labels, assignee, reported_by, created_at, updated_at, closed_at)
  SELECT
    r.id,
    i.title,
    i.description,
    i.status,
    i.priority,
    i.labels,
    i.assignee,
    i.reported_by,
    r.created_at + (i.days_after || ' days')::interval,
    r.created_at + (i.days_after || ' days')::interval + (i.days_since_update || ' days')::interval,
    CASE WHEN i.status = 'closed' THEN r.created_at + (i.days_after || ' days')::interval + (i.days_since_update || ' days')::interval ELSE NULL END
  FROM repositories r
  CROSS JOIN LATERAL (
    VALUES
      ('Authentication timeout on mobile devices', 'Users are experiencing session timeouts after 5 minutes of inactivity on mobile apps', 'open', 'high', ARRAY['bug', 'mobile', 'auth'], 'Bob Martinez', 'Alice Johnson', '15', '3'),
      ('Add rate limiting to API endpoints', 'Implement rate limiting to prevent abuse', 'in_progress', 'medium', ARRAY['enhancement', 'api', 'security'], 'Carol Zhang', 'Alice Johnson', '20', '5'),
      ('Memory leak in background sync', 'Background sync process is consuming increasing amounts of memory over time', 'open', 'critical', ARRAY['bug', 'performance'], 'David Kumar', 'Bob Martinez', '25', '2'),
      ('Update dependencies to latest versions', 'Security audit flagged outdated dependencies', 'closed', 'high', ARRAY['dependencies', 'security'], 'Emma Wilson', 'Carol Zhang', '30', '15')
  ) AS i(title, description, status, priority, labels, assignee, reported_by, days_after, days_since_update)
  WHERE r.slug IN ('acme-api', 'ml-models', 'cli-tools')
  LIMIT 50

  RETURNING id, repository_id, title, created_at
)
-- Insert comments for issues
INSERT INTO issue_comments (issue_id, author, body, created_at)
SELECT
  ii.id,
  c.author,
  c.body,
  ii.created_at + (c.days_after || ' days')::interval
FROM inserted_issues ii
CROSS JOIN LATERAL (
  VALUES
    ('Alice Johnson', 'I''ve reproduced this on iOS 16.4. Investigating the session management code.', '1'),
    ('Bob Martinez', 'Found the issue - the token refresh logic has a race condition. Working on a fix.', '2'),
    ('Carol Zhang', 'PR #234 submitted with the fix. Ready for review.', '4')
) AS c(author, body, days_after)
WHERE ii.title LIKE '%timeout%' OR ii.title LIKE '%memory leak%';

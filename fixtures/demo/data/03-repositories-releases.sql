-- ============================================================================
-- DATA: Repositories and Releases model registration and sample data
-- ============================================================================

-- Register repositories model
INSERT INTO "models" (model_name, status, description)
  VALUES ('repositories', 'active', 'Code repositories for project management');

-- Register repositories fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('repositories', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('repositories', 'name', 'text', 'true', 'Repository name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum, pattern)
  VALUES ('repositories', 'slug', 'text', 'true', 'URL-friendly identifier', 100, '^[a-z0-9-]+$');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('repositories', 'description', 'text', 'false', 'Repository description', 1000);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('repositories', 'visibility', 'text', 'false', 'Repository visibility', ARRAY['public', 'private', 'internal']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('repositories', 'primary_language', 'text', 'false', 'Primary programming language', 50);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('repositories', 'topics', 'text[]', 'false', 'Repository topics/tags for categorization');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('repositories', 'stars', 'integer', 'false', 'Star count', 0, 999999);

-- Register releases model
INSERT INTO "models" (model_name, status, description)
  VALUES ('releases', 'active', 'Software releases, tags, and versioning');

-- Register releases fields
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

-- Sample data for repositories and releases
-- References workspaces created in 01-workspaces-teams.sql

-- Insert repositories
WITH inserted_repositories AS (
  INSERT INTO repositories (workspace_id, name, slug, description, visibility, primary_language, topics, stars, created_at, updated_at)
  SELECT
    w.id,
    r.name,
    r.slug,
    r.description,
    r.visibility,
    r.primary_language,
    r.topics,
    r.stars,
    w.created_at + (r.days_after || ' days')::interval,
    w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      -- Acme Corp repositories
      ('acme-api', 'acme-api', 'Core API server and backend services', 'private', 'TypeScript', ARRAY['api', 'backend', 'rest'], 45, '10', '15'),
      ('acme-web', 'acme-web', 'Customer-facing web application', 'private', 'React', ARRAY['frontend', 'react', 'ui'], 32, '15', '5'),
      ('acme-mobile', 'acme-mobile', 'iOS and Android mobile applications', 'private', 'React Native', ARRAY['mobile', 'ios', 'android'], 28, '20', '10')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'acme-corp'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('ml-models', 'ml-models', 'Machine learning model training and deployment', 'public', 'Python', ARRAY['ml', 'ai', 'pytorch'], 234, '8', '3'),
      ('data-pipeline', 'data-pipeline', 'Real-time data processing pipeline', 'public', 'Python', ARRAY['data', 'streaming', 'kafka'], 156, '12', '7'),
      ('research-notebooks', 'research-notebooks', 'Jupyter notebooks for research experiments', 'private', 'Jupyter Notebook', ARRAY['research', 'jupyter'], 12, '18', '12')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'techstart-labs'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('cli-tools', 'cli-tools', 'Command-line developer tools', 'public', 'Go', ARRAY['cli', 'tools', 'devtools'], 421, '7', '2'),
      ('vscode-extension', 'vscode-extension', 'VS Code extension for productivity', 'public', 'TypeScript', ARRAY['vscode', 'extension'], 312, '14', '8'),
      ('api-client', 'api-client', 'REST API client library', 'public', 'JavaScript', ARRAY['api', 'sdk', 'client'], 189, '21', '14')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'devtools-inc'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('autoscaler', 'autoscaler', 'Intelligent auto-scaling system', 'private', 'Rust', ARRAY['scaling', 'cloud', 'kubernetes'], 67, '5', '4'),
      ('monitoring-agent', 'monitoring-agent', 'System monitoring and metrics collection', 'public', 'Go', ARRAY['monitoring', 'metrics'], 145, '10', '6'),
      ('load-balancer', 'load-balancer', 'High-performance load balancer', 'private', 'Rust', ARRAY['networking', 'performance'], 89, '15', '9')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'cloudscale'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('stream-processor', 'stream-processor', 'High-throughput stream processing engine', 'public', 'Java', ARRAY['streaming', 'bigdata'], 278, '6', '5'),
      ('analytics-dashboard', 'analytics-dashboard', 'Real-time analytics visualization', 'private', 'React', ARRAY['analytics', 'dashboard'], 34, '12', '8')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'datapipe'

  UNION ALL

  SELECT w.id, r.name, r.slug, r.description, r.visibility, r.primary_language, r.topics, r.stars,
         w.created_at + (r.days_after || ' days')::interval,
         w.created_at + (r.days_after || ' days')::interval + (r.days_since_update || ' days')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('auth-service', 'auth-service', 'Authentication and authorization service', 'private', 'Go', ARRAY['auth', 'security', 'oauth'], 112, '4', '2'),
      ('2fa-lib', '2fa-lib', 'Two-factor authentication library', 'public', 'TypeScript', ARRAY['2fa', 'security', 'library'], 201, '8', '6'),
      ('sso-gateway', 'sso-gateway', 'Single sign-on gateway service', 'private', 'Go', ARRAY['sso', 'saml', 'oauth'], 78, '14', '11')
  ) AS r(name, slug, description, visibility, primary_language, topics, stars, days_after, days_since_update)
  WHERE w.slug = 'secureauth'

  RETURNING id, name, slug, created_at
)
-- Insert releases for repositories
INSERT INTO releases (repository_id, version, name, description, tag, is_prerelease, is_draft, published_by, published_at, created_at)
SELECT
  ir.id,
  rel.version,
  rel.name,
  rel.description,
  rel.tag,
  rel.is_prerelease::boolean,
  rel.is_draft::boolean,
  rel.published_by,
  ir.created_at + (rel.days_after || ' days')::interval,
  ir.created_at + (rel.days_after || ' days')::interval - interval '2 days'
FROM inserted_repositories ir
CROSS JOIN LATERAL (
  VALUES
    ('v1.0.0', 'Initial Release', 'First production release with core features', 'v1.0.0', 'false', 'false', 'Alice Johnson', '30'),
    ('v1.1.0', 'Feature Update', 'Added new authentication methods', 'v1.1.0', 'false', 'false', 'Bob Martinez', '60'),
    ('v1.2.0', 'Performance Improvements', 'Optimized query performance and caching', 'v1.2.0', 'false', 'false', 'Alice Johnson', '90')
) AS rel(version, name, description, tag, is_prerelease, is_draft, published_by, days_after)
WHERE ir.slug IN ('acme-api', 'ml-models', 'cli-tools', 'autoscaler', 'stream-processor', 'auth-service')

UNION ALL

SELECT ir.id, rel.version, rel.name, rel.description, rel.tag, rel.is_prerelease::boolean, rel.is_draft::boolean, rel.published_by,
       ir.created_at + (rel.days_after || ' days')::interval,
       ir.created_at + (rel.days_after || ' days')::interval - interval '2 days'
FROM inserted_repositories ir
CROSS JOIN LATERAL (
  VALUES
    ('v2.0.0-beta.1', 'Beta Release', 'Testing new UI components', 'v2.0.0-beta.1', 'true', 'false', 'Frank Chen', '45'),
    ('v2.0.0', 'Major Version 2.0', 'Complete UI redesign and new features', 'v2.0.0', 'false', 'false', 'Grace Park', '75')
) AS rel(version, name, description, tag, is_prerelease, is_draft, published_by, days_after)
WHERE ir.slug IN ('acme-web', 'vscode-extension', 'analytics-dashboard', '2fa-lib')

UNION ALL

SELECT ir.id, rel.version, rel.name, rel.description, rel.tag, rel.is_prerelease::boolean, rel.is_draft::boolean, rel.published_by,
       ir.created_at + (rel.days_after || ' days')::interval,
       ir.created_at + (rel.days_after || ' days')::interval - interval '2 days'
FROM inserted_repositories ir
CROSS JOIN LATERAL (
  VALUES
    ('v0.9.0', 'Release Candidate', 'Feature complete, testing in progress', 'v0.9.0', 'true', 'false', 'Rachel Green', '25')
) AS rel(version, name, description, tag, is_prerelease, is_draft, published_by, days_after)
WHERE ir.slug IN ('acme-mobile', 'data-pipeline', 'api-client', 'monitoring-agent', 'sso-gateway');

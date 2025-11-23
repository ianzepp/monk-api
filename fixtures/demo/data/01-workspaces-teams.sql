-- ============================================================================
-- DATA: Workspaces and Teams model registration and sample data
-- ============================================================================

-- Register workspaces model
INSERT INTO "models" (model_name, status)
VALUES ('workspaces', 'active');

-- Register workspaces fields
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('workspaces', 'name', 'text', 'true', 'Organization name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum, pattern, "unique")
  VALUES ('workspaces', 'slug', 'text', 'true', 'URL-friendly identifier (lowercase, alphanumeric, hyphens)', 100, '^[a-z0-9-]+$', 'true');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('workspaces', 'description', 'text', 'false', 'Organization description', 500);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('workspaces', 'settings', 'jsonb', 'false', 'Workspace settings (theme, preferences, feature flags)');

-- Register teams model
INSERT INTO "models" (model_name, status, description)
  VALUES ('teams', 'active', 'Development teams and groups within workspaces');

-- Register teams fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('teams', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('teams', 'name', 'text', 'true', 'Team name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('teams', 'description', 'text', 'false', 'Team description', 500);

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('teams', 'focus_area', 'text', 'false', 'Team focus area', ARRAY['backend', 'frontend', 'ai-ml', 'devops', 'design', 'product', 'data']);

-- Sample data for workspaces and teams
-- Using CTEs with gen_random_uuid() for true random IDs

-- Insert workspaces and teams in one transaction
WITH inserted_workspaces AS (
  INSERT INTO workspaces (name, slug, description, settings, created_at) VALUES
    ('Acme Corporation', 'acme-corp', 'Enterprise software solutions and consulting services', '{"theme": "blue", "features": ["analytics", "reporting"]}', now() - interval '180 days'),
    ('TechStart Labs', 'techstart-labs', 'Innovative AI and machine learning research startup', '{"theme": "dark", "features": ["ai", "beta-access"]}', now() - interval '150 days'),
    ('DevTools Inc', 'devtools-inc', 'Developer productivity tools and platforms', '{"theme": "green", "features": ["integrations", "api-access"]}', now() - interval '120 days'),
    ('CloudScale Systems', 'cloudscale', 'Cloud infrastructure and scaling solutions', '{"theme": "purple", "features": ["monitoring", "autoscale"]}', now() - interval '90 days'),
    ('DataPipe Co', 'datapipe', 'Real-time data pipeline and analytics platform', '{"theme": "orange", "features": ["streaming", "analytics"]}', now() - interval '60 days'),
    ('SecureAuth Solutions', 'secureauth', 'Identity and authentication services', '{"theme": "red", "features": ["sso", "2fa", "compliance"]}', now() - interval '30 days')
  RETURNING id, name, slug, created_at
),
inserted_teams AS (
  INSERT INTO teams (workspace_id, name, description, focus_area, created_at)
  -- Acme Corporation teams
  SELECT id, 'Backend Engineering', 'Core API and backend services', 'backend', created_at + interval '5 days'
  FROM inserted_workspaces WHERE slug = 'acme-corp'
  UNION ALL
  SELECT id, 'Frontend Team', 'Web and mobile user interfaces', 'frontend', created_at + interval '5 days'
  FROM inserted_workspaces WHERE slug = 'acme-corp'

  -- TechStart Labs teams
  UNION ALL
  SELECT id, 'AI/ML Research', 'Machine learning models and research', 'ai-ml', created_at + interval '3 days'
  FROM inserted_workspaces WHERE slug = 'techstart-labs'
  UNION ALL
  SELECT id, 'Data Engineering', 'Data pipelines and infrastructure', 'backend', created_at + interval '7 days'
  FROM inserted_workspaces WHERE slug = 'techstart-labs'

  -- DevTools Inc teams
  UNION ALL
  SELECT id, 'DevOps & Infrastructure', 'CI/CD and cloud infrastructure', 'devops', created_at + interval '4 days'
  FROM inserted_workspaces WHERE slug = 'devtools-inc'
  UNION ALL
  SELECT id, 'Product Design', 'UX/UI and product design', 'design', created_at + interval '6 days'
  FROM inserted_workspaces WHERE slug = 'devtools-inc'

  -- CloudScale Systems teams
  UNION ALL
  SELECT id, 'Platform Engineering', 'Core platform and scaling systems', 'backend', created_at + interval '2 days'
  FROM inserted_workspaces WHERE slug = 'cloudscale'

  -- DataPipe Co teams
  UNION ALL
  SELECT id, 'Streaming Infrastructure', 'Real-time data streaming', 'backend', created_at + interval '3 days'
  FROM inserted_workspaces WHERE slug = 'datapipe'
  UNION ALL
  SELECT id, 'Analytics Team', 'Analytics and visualization', 'data', created_at + interval '5 days'
  FROM inserted_workspaces WHERE slug = 'datapipe'

  -- SecureAuth Solutions teams
  UNION ALL
  SELECT id, 'Security Engineering', 'Authentication and security services', 'backend', created_at + interval '2 days'
  FROM inserted_workspaces WHERE slug = 'secureauth'

  RETURNING id, workspace_id, name, created_at
)
SELECT COUNT(*) FROM inserted_teams;

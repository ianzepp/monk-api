-- ============================================================================
-- DATA: Members model registration and sample data
-- ============================================================================

-- Register members model
INSERT INTO "models" (model_name, status, description)
  VALUES ('members', 'active', 'Team members and users');

-- Register members fields
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('members', 'team_id', 'uuid', 'true', 'Foreign key to teams table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('members', 'name', 'text', 'true', 'Member full name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum, pattern)
  VALUES ('members', 'email', 'text', 'true', 'Email address', 255, '^[^@]+@[^@]+\.[^@]+$');

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('members', 'role', 'text', 'false', 'Member role in team', ARRAY['lead', 'senior', 'mid', 'junior', 'intern']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('members', 'timezone', 'text', 'false', 'Timezone identifier', 50);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('members', 'avatar_url', 'text', 'false', 'URL to avatar image', 500);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('members', 'joined_at', 'timestamp', 'false', 'Timestamp when member joined the team');

-- Sample data for members
-- References teams created in 01-workspaces-teams.sql

INSERT INTO members (team_id, name, email, role, timezone, avatar_url, joined_at)
-- Get team IDs and insert members
SELECT
  t.id,
  m.name,
  m.email,
  m.role,
  m.timezone,
  m.avatar_url,
  t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    -- Backend Engineering (Acme Corp)
    ('Alice Johnson', 'alice.johnson@acme-corp.com', 'lead', 'America/New_York', 'https://i.pravatar.cc/150?img=1', '2'),
    ('Bob Martinez', 'bob.martinez@acme-corp.com', 'senior', 'America/Los_Angeles', 'https://i.pravatar.cc/150?img=2', '5'),
    ('Carol Zhang', 'carol.zhang@acme-corp.com', 'mid', 'Asia/Shanghai', 'https://i.pravatar.cc/150?img=3', '10'),
    ('David Kumar', 'david.kumar@acme-corp.com', 'mid', 'Asia/Kolkata', null, '15'),
    ('Emma Wilson', 'emma.wilson@acme-corp.com', 'junior', 'Europe/London', 'https://i.pravatar.cc/150?img=5', '20')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Backend Engineering'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Frank Chen', 'frank.chen@acme-corp.com', 'lead', 'America/Chicago', 'https://i.pravatar.cc/150?img=6', '3'),
    ('Grace Park', 'grace.park@acme-corp.com', 'senior', 'Asia/Seoul', 'https://i.pravatar.cc/150?img=7', '7'),
    ('Henry Thompson', 'henry.thompson@acme-corp.com', 'mid', 'Europe/Paris', null, '12'),
    ('Iris Patel', 'iris.patel@acme-corp.com', 'junior', 'America/New_York', 'https://i.pravatar.cc/150?img=9', '18')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Frontend Team'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Dr. Sarah Mitchell', 'sarah.mitchell@techstart.io', 'lead', 'America/San_Francisco', 'https://i.pravatar.cc/150?img=10', '1'),
    ('James Rodriguez', 'james.rodriguez@techstart.io', 'senior', 'America/New_York', 'https://i.pravatar.cc/150?img=11', '4'),
    ('Kim Lee', 'kim.lee@techstart.io', 'senior', 'Asia/Singapore', 'https://i.pravatar.cc/150?img=12', '8'),
    ('Lisa Anderson', 'lisa.anderson@techstart.io', 'mid', 'Europe/London', null, '14'),
    ('Mike O''Brien', 'mike.obrien@techstart.io', 'junior', 'Europe/Dublin', 'https://i.pravatar.cc/150?img=14', '22')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'AI/ML Research'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Nina Gupta', 'nina.gupta@techstart.io', 'senior', 'Asia/Kolkata', 'https://i.pravatar.cc/150?img=15', '2'),
    ('Oscar Silva', 'oscar.silva@techstart.io', 'mid', 'America/Sao_Paulo', 'https://i.pravatar.cc/150?img=16', '9'),
    ('Paula Nowak', 'paula.nowak@techstart.io', 'mid', 'Europe/Warsaw', null, '16'),
    ('Quinn Davis', 'quinn.davis@techstart.io', 'junior', 'America/Denver', 'https://i.pravatar.cc/150?img=18', '25')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Data Engineering'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Rachel Green', 'rachel.green@devtools.dev', 'lead', 'America/Seattle', 'https://i.pravatar.cc/150?img=19', '1'),
    ('Sam Taylor', 'sam.taylor@devtools.dev', 'senior', 'America/Austin', 'https://i.pravatar.cc/150?img=20', '5'),
    ('Tina Brown', 'tina.brown@devtools.dev', 'mid', 'Europe/Amsterdam', 'https://i.pravatar.cc/150?img=21', '11'),
    ('Uma Patel', 'uma.patel@devtools.dev', 'junior', 'Asia/Mumbai', null, '19')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'DevOps & Infrastructure'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Victor Wong', 'victor.wong@devtools.dev', 'lead', 'Asia/Hong_Kong', 'https://i.pravatar.cc/150?img=22', '2'),
    ('Wendy Garcia', 'wendy.garcia@devtools.dev', 'senior', 'America/Mexico_City', 'https://i.pravatar.cc/150?img=23', '8'),
    ('Xavier Kim', 'xavier.kim@devtools.dev', 'mid', 'Asia/Seoul', null, '15'),
    ('Yuki Tanaka', 'yuki.tanaka@devtools.dev', 'mid', 'Asia/Tokyo', 'https://i.pravatar.cc/150?img=25', '21')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Product Design'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Zara Ahmed', 'zara.ahmed@cloudscale.cloud', 'lead', 'Europe/London', 'https://i.pravatar.cc/150?img=26', '1'),
    ('Adam Scott', 'adam.scott@cloudscale.cloud', 'senior', 'America/New_York', 'https://i.pravatar.cc/150?img=27', '4'),
    ('Beth Murphy', 'beth.murphy@cloudscale.cloud', 'senior', 'Europe/Dublin', 'https://i.pravatar.cc/150?img=28', '7'),
    ('Chris Li', 'chris.li@cloudscale.cloud', 'mid', 'America/Vancouver', null, '13'),
    ('Diana Ross', 'diana.ross@cloudscale.cloud', 'mid', 'America/Chicago', 'https://i.pravatar.cc/150?img=30', '20')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Platform Engineering'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Ethan Hunt', 'ethan.hunt@datapipe.io', 'senior', 'America/Denver', 'https://i.pravatar.cc/150?img=31', '2'),
    ('Fiona Apple', 'fiona.apple@datapipe.io', 'mid', 'America/Portland', 'https://i.pravatar.cc/150?img=32', '9'),
    ('George Martin', 'george.martin@datapipe.io', 'mid', 'Europe/London', null, '16')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Streaming Infrastructure'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Hannah Baker', 'hannah.baker@datapipe.io', 'lead', 'America/San_Francisco', 'https://i.pravatar.cc/150?img=33', '1'),
    ('Ian Malcolm', 'ian.malcolm@datapipe.io', 'senior', 'America/Los_Angeles', 'https://i.pravatar.cc/150?img=34', '6'),
    ('Julia Roberts', 'julia.roberts@datapipe.io', 'mid', 'America/New_York', 'https://i.pravatar.cc/150?img=35', '12')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Analytics Team'

UNION ALL

SELECT t.id, m.name, m.email, m.role, m.timezone, m.avatar_url, t.created_at + (m.days_after_team || ' days')::interval
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('Kevin Flynn', 'kevin.flynn@secureauth.net', 'lead', 'America/Seattle', 'https://i.pravatar.cc/150?img=36', '1'),
    ('Laura Palmer', 'laura.palmer@secureauth.net', 'senior', 'America/Pacific', 'https://i.pravatar.cc/150?img=37', '5'),
    ('Mark Twain', 'mark.twain@secureauth.net', 'senior', 'America/Eastern', 'https://i.pravatar.cc/150?img=38', '10'),
    ('Nancy Drew', 'nancy.drew@secureauth.net', 'mid', 'America/Chicago', null, '17'),
    ('Oliver Twist', 'oliver.twist@secureauth.net', 'junior', 'Europe/London', 'https://i.pravatar.cc/150?img=40', '24')
) AS m(name, email, role, timezone, avatar_url, days_after_team)
WHERE t.name = 'Security Engineering';

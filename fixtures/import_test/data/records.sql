-- Data records for records schema (SQL version)
-- These records test various validation rules and column types

INSERT INTO records (name, email, age, balance, is_active, status, metadata, tags, created_date)
  VALUES (
    'Alice Johnson',
    'alice.johnson@example.com',
    28,
    1500.50,
    true,
    'active',
    '{"department": "Engineering", "role": "Senior Developer", "level": 3}',
    ARRAY['engineering', 'backend', 'python'],
    now() - interval '30 days'
  );

INSERT INTO records (name, email, age, balance, is_active, status, metadata, tags, created_date)
  VALUES (
    'Bob Smith',
    'bob.smith@company.io',
    35,
    2750.00,
    true,
    'active',
    '{"department": "Sales", "role": "Account Manager", "territory": "West Coast"}',
    ARRAY['sales', 'b2b', 'enterprise'],
    now() - interval '60 days'
  );

INSERT INTO records (name, email, age, balance, is_active, status, metadata, tags, created_date)
  VALUES (
    'Carol Davis',
    'carol.davis@startup.dev',
    NULL,
    0.00,
    false,
    'pending',
    '{"department": "Marketing", "role": "Content Writer"}',
    ARRAY['marketing', 'content'],
    now() - interval '5 days'
  );

INSERT INTO records (name, email, age, balance, is_active, status, metadata, tags, created_date)
  VALUES (
    'David Wilson',
    'david.w@enterprise.com',
    42,
    5000.00,
    true,
    'active',
    '{"department": "Engineering", "role": "VP Engineering", "level": 7, "team_size": 45}',
    ARRAY['engineering', 'leadership', 'management'],
    now() - interval '180 days'
  );

INSERT INTO records (name, email, age, balance, is_active, status, metadata, tags)
  VALUES (
    'Eve Martinez',
    'eve.martinez@demo.test',
    25,
    750.25,
    true,
    'inactive',
    NULL,
    ARRAY['operations', 'support']
  );

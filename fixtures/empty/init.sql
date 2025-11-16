-- Testing Fixture Initialization
-- This runs after init-tenant.sql but before schemas and data are loaded

-- Insert core users for testing
-- These users are required by many tests that authenticate with specific access levels

INSERT INTO users (name, auth, access) VALUES
    ('Dr Root', 'root', 'root'),
    ('Mr Full', 'full', 'full'),
    ('Jr User', 'user', 'edit')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Empty fixture includes pre-configured users for test authentication';

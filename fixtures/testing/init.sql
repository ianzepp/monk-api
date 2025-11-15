-- Testing Fixture Initialization
-- This runs after init-tenant.sql but before schemas and data are loaded

-- Insert core users for testing
-- These users are required by many tests that authenticate with specific access levels

INSERT INTO users (name, auth, access) VALUES
    ('Root User', 'root', 'root'),
    ('Full User', 'full', 'full')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Testing fixture includes pre-configured root and full users for test authentication';

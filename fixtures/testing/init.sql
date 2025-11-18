-- Testing Fixture Initialization
-- This runs after init-template-default.sql but before schemas and data are loaded

-- Insert core users for testing
-- Root user already exists (created in the default template)
-- These users are required by many tests that authenticate with specific access levels

INSERT INTO users (name, auth, access) VALUES
    ('Mr Full', 'full', 'full'),
    ('Jr User', 'user', 'edit')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Testing fixture includes pre-configured users for test authentication';

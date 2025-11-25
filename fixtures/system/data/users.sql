-- ============================================================================
-- DATA: Users model registration and default users
-- ============================================================================

-- Register users model
INSERT INTO "models" (model_name, status, sudo)
VALUES ('users', 'system', true);

-- ============================================================================
-- FIELDS FOR: users
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('users', 'name', 'text', true, 'User display name'),
    ('users', 'auth', 'text', true, 'Authentication identifier'),
    ('users', 'access', 'text', true, 'User access level (root, full, edit, read, deny)');

-- Insert default root user for initial access
INSERT INTO users (name, auth, access) VALUES
    ('root', 'root', 'root')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Default template includes pre-configured root user for initial login';

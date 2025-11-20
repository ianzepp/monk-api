-- ============================================================================
-- DATA: Default users
-- ============================================================================
-- Insert default root user for initial access

INSERT INTO users (name, auth, access) VALUES
    ('root', 'root', 'root')
ON CONFLICT (auth) DO NOTHING;

COMMENT ON TABLE users IS 'Default template includes pre-configured root user for initial login';

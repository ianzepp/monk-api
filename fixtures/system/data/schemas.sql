-- ============================================================================
-- DATA: Schema registrations
-- ============================================================================
-- Register all system schemas in the schemas table
-- This enables recursive schema discovery via the Data API

-- schemas table (self-reference for recursive discovery)
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES ('schemas', 'system', true);

-- columns table (self-reference for recursive discovery)
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES ('columns', 'system', true);

-- users table
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES ('users', 'system', true);

-- history table (change tracking / audit trail)
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES ('history', 'system', true);

-- snapshots table (point-in-time database backups)
INSERT INTO "schemas" (schema_name, status, sudo, description)
VALUES (
    'snapshots',
    'system',
    true,
    'Point-in-time database backups created via async observer pipeline'
);

-- definitions table (compiled JSON Schema definitions)
INSERT INTO "schemas" (schema_name, status, sudo)
VALUES ('definitions', 'system', true)
ON CONFLICT (schema_name) DO NOTHING;

-- ============================================================================
-- DATA: Model registrations
-- ============================================================================
-- Register all system models in the models table
-- This enables recursive model discovery via the Data API

-- models table (self-reference for recursive discovery)
INSERT INTO "models" (model_name, status, sudo)
VALUES ('models', 'system', true);

-- fields table (self-reference for recursive discovery)
INSERT INTO "models" (model_name, status, sudo)
VALUES ('fields', 'system', true);

-- users table
INSERT INTO "models" (model_name, status, sudo)
VALUES ('users', 'system', true);

-- history table (change tracking / audit trail)
INSERT INTO "models" (model_name, status, sudo)
VALUES ('history', 'system', true);

-- snapshots table (point-in-time database backups)
INSERT INTO "models" (model_name, status, sudo, description)
VALUES (
    'snapshots',
    'system',
    true,
    'Point-in-time database backups created via async observer pipeline'
);

-- Initialize import_test fixture with root user for API access
-- This user is needed for JWT authentication during JSON data loading

INSERT INTO users (id, name, auth, access)
VALUES (
  gen_random_uuid(),
  'Fixture Root',
  'root@fixture.test',
  'root'
);

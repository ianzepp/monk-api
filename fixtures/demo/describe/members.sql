-- Model definition for members
-- Team members and users

-- Insert model record
INSERT INTO models (model_name, status, description)
  VALUES ('members', 'active', 'Team members and users');

-- Insert field definitions
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

-- Create the actual table from model definition
SELECT create_table_from_schema('members');

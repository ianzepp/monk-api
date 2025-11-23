-- Model definition for contact
-- Generated model definition

-- Insert model record
INSERT INTO models (model_name, status) VALUES ('contact', 'active');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('contact', 'name', 'text', 'true', 'Contact full name', 1, 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('contact', 'email', 'text', 'true', 'Contact email address');

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('contact', 'phone', 'text', 'false', 'Contact phone number', '^\+?[1-9]\d{1,14}$');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('contact', 'company', 'text', 'false', 'Company name', 100);

INSERT INTO fields (model_name, field_name, type, required, default_value, description, enum_values)
  VALUES ('contact', 'status', 'text', 'false', 'prospect', 'Contact status', ARRAY['active', 'inactive', 'prospect']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('contact', 'notes', 'text', 'false', 'Additional notes about the contact');

-- Create the actual table from model definition
SELECT create_table_from_schema('contact');

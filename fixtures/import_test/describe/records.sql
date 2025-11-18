-- Schema definition for records
-- Comprehensive test schema with various column types and validation rules

-- Insert schema record
INSERT INTO schemas (schema_name, status)
  VALUES ('records', 'active');

-- Text field with length constraints
INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('records', 'name', 'text', 'true', 'Record name (2-100 characters)', 2, 100);

-- Email with pattern validation
INSERT INTO columns (schema_name, column_name, type, required, description, pattern, maximum)
  VALUES ('records', 'email', 'text', 'true', 'Email address', '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', 255);

-- Integer with range validation
INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('records', 'age', 'integer', 'false', 'Age in years (0-150)', 0, 150);

-- Numeric/decimal with precision
INSERT INTO columns (schema_name, column_name, type, required, default_value, description, minimum)
  VALUES ('records', 'balance', 'numeric', 'false', '0.00', 'Account balance', 0);

-- Boolean with default
INSERT INTO columns (schema_name, column_name, type, required, default_value, description)
  VALUES ('records', 'is_active', 'boolean', 'false', 'true', 'Whether the record is active');

-- Enum field
INSERT INTO columns (schema_name, column_name, type, required, default_value, description, enum_values)
  VALUES ('records', 'status', 'text', 'false', 'pending', 'Record status', ARRAY['pending', 'active', 'inactive', 'archived']);

-- JSONB field
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('records', 'metadata', 'jsonb', 'false', 'Flexible metadata storage');

-- Array field
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('records', 'tags', 'text[]', 'false', 'Array of tags');

-- Timestamp field
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('records', 'created_date', 'timestamp', 'false', 'Custom creation timestamp');

-- Create the actual table from schema definition
SELECT create_table_from_schema('records');

-- Model definition for account
-- Generated model definition

-- Insert model record
INSERT INTO models (model_name, status) VALUES ('account', 'active');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('account', 'name', 'text', 'true', 'Account holder full name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('account', 'email', 'text', 'true', 'Primary email address', 255);

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('account', 'username', 'text', 'true', 'Unique username for login', '^[a-zA-Z0-9_-]{3,50}$');

INSERT INTO fields (model_name, field_name, type, required, default_value, description, enum_values)
  VALUES ('account', 'account_type', 'text', 'true', 'personal', 'Type of account', ARRAY['personal', 'business', 'trial', 'premium']);

INSERT INTO fields (model_name, field_name, type, required, default_value, description, minimum, maximum)
  VALUES ('account', 'balance', 'numeric', 'false', '0', 'Account balance in USD', 0, 1000000);

INSERT INTO fields (model_name, field_name, type, required, default_value, description)
  VALUES ('account', 'is_active', 'boolean', 'false', 'true', 'Whether the account is currently active');

INSERT INTO fields (model_name, field_name, type, required, default_value, description)
  VALUES ('account', 'is_verified', 'boolean', 'false', 'false', 'Whether the account email is verified');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('account', 'credit_limit', 'numeric', 'false', 'Credit limit for business accounts (null for personal/trial)', 0, 10000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('account', 'last_login', 'timestamp', 'false', 'Timestamp of last login (null if never logged in)');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('account', 'preferences', 'jsonb', 'false', 'User preferences and settings');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('account', 'metadata', 'jsonb', 'false', 'Additional flexible metadata');

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('account', 'phone', 'text', 'false', 'Phone number (optional)', '^\+?[1-9]\d{1,14}$|^\+?1 \([0-9]{3}\) [0-9]{3}-[0-9]{4}$');

-- Create the actual table from model definition
SELECT create_table_from_model('account');

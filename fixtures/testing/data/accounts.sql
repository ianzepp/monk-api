-- ============================================================================
-- DATA: Account model registration and sample data
-- ============================================================================

-- Register accounts model
INSERT INTO "models" (model_name, status)
VALUES ('accounts', 'active');

-- Register accounts fields
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('accounts', 'name', 'text', 'true', 'Account holder full name', 2, 100);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('accounts', 'email', 'text', 'true', 'Primary email address', 255);

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('accounts', 'username', 'text', 'true', 'Unique username for login', '^[a-zA-Z0-9_-]{3,50}$');

INSERT INTO fields (model_name, field_name, type, required, default_value, description, enum_values)
  VALUES ('accounts', 'accounts_type', 'text', 'true', 'personal', 'Type of accounts', ARRAY['personal', 'business', 'trial', 'premium']);

INSERT INTO fields (model_name, field_name, type, required, default_value, description, minimum, maximum)
  VALUES ('accounts', 'balance', 'numeric', 'false', '0', 'Account balance in USD', 0, 1000000);

INSERT INTO fields (model_name, field_name, type, required, default_value, description)
  VALUES ('accounts', 'is_active', 'boolean', 'false', 'true', 'Whether the accounts is currently active');

INSERT INTO fields (model_name, field_name, type, required, default_value, description)
  VALUES ('accounts', 'is_verified', 'boolean', 'false', 'false', 'Whether the accounts email is verified');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('accounts', 'credit_limit', 'numeric', 'false', 'Credit limit for business accountss (null for personal/trial)', 0, 10000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('accounts', 'last_login', 'timestamp', 'false', 'Timestamp of last login (null if never logged in)');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('accounts', 'preferences', 'jsonb', 'false', 'User preferences and settings');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('accounts', 'metadata', 'jsonb', 'false', 'Additional flexible metadata');

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('accounts', 'phone', 'text', 'false', 'Phone number (optional)', '^\+?[1-9]\d{1,14}$|^\+?1 \([0-9]{3}\) [0-9]{3}-[0-9]{4}$');

-- Sample data
INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('John Smith', 'john.smith@example.com', 'jsmith', 'personal', 1250.75, true, true, NULL, NULL);

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Jane Doe', 'jane.doe@business.com', 'jdoe', 'business', 5000, true, true, 10000, NULL);

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Bob Johnson', 'bob@startup.io', 'bjohnson', 'trial', 0, true, false, NULL, NULL);

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Alice Wilson', 'alice.wilson@corp.com', 'awilson', 'premium', 2500.25, true, true, 5000, '{"theme":"dark","notifications":true,"language":"en"}');

INSERT INTO accounts (name, email, username, accounts_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Charlie Brown', 'charlie@demo.test', 'cbrown', 'personal', 150, false, false, NULL, NULL);

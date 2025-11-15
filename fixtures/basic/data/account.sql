-- Data records for account
-- Generated from JSON data format

INSERT INTO account (name, email, username, account_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('John Smith', 'john.smith@example.com', 'jsmith', 'personal', 1250.75, true, true, NULL, NULL);

INSERT INTO account (name, email, username, account_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Jane Doe', 'jane.doe@business.com', 'jdoe', 'business', 5000, true, true, 10000, NULL);

INSERT INTO account (name, email, username, account_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Bob Johnson', 'bob@startup.io', 'bjohnson', 'trial', 0, true, false, NULL, NULL);

INSERT INTO account (name, email, username, account_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Alice Wilson', 'alice.wilson@corp.com', 'awilson', 'premium', 2500.25, true, true, 5000, '{"theme":"dark","notifications":true,"language":"en"}');

INSERT INTO account (name, email, username, account_type, balance, is_active, is_verified, credit_limit, preferences)
  VALUES ('Charlie Brown', 'charlie@demo.test', 'cbrown', 'personal', 150, false, false, NULL, NULL);

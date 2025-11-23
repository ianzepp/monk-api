-- ============================================================================
-- DATA: Contact model registration and sample data
-- ============================================================================

-- Register contacts model
INSERT INTO "models" (model_name, status)
VALUES ('contacts', 'active');

-- Register contacts fields
INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('contacts', 'name', 'text', 'true', 'Contact full name', 1, 100);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('contacts', 'email', 'text', 'true', 'Contact email address');

INSERT INTO fields (model_name, field_name, type, required, description, pattern)
  VALUES ('contacts', 'phone', 'text', 'false', 'Contact phone number', '^\+?[1-9]\d{1,14}$');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('contacts', 'company', 'text', 'false', 'Company name', 100);

INSERT INTO fields (model_name, field_name, type, required, default_value, description, enum_values)
  VALUES ('contacts', 'status', 'text', 'false', 'prospect', 'Contact status', ARRAY['active', 'inactive', 'prospect']);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('contacts', 'notes', 'text', 'false', 'Additional notes about the contacts');

-- Sample data
INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('David Miller', 'david.miller@client.com', '+15551234567', 'Miller & Associates', 'active', 'Primary contacts for Miller & Associates account');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Sarah Connor', 'sarah@techcorp.com', '+15559876543', 'TechCorp Solutions', 'active', 'Technical lead, prefers email communication');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Mike Thompson', 'mike.thompson@startup.io', '+15554567890', 'Innovation Startup', 'prospect', 'Interested in premium features, follow up in Q3');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Lisa Rodriguez', 'lisa@consulting.biz', '+15553210987', 'Rodriguez Consulting', 'active', 'Long-term client, very satisfied with service');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Tom Wilson', 'tom.wilson@oldcorp.com', NULL, 'Legacy Corp', 'inactive', 'Account closed, contacts moved to competitor');

INSERT INTO contacts (name, email, phone, company, status, notes)
  VALUES ('Emily Johnson', 'emily@newventure.com', '+15555551234', 'New Venture LLC', 'prospect', 'Demo scheduled for next week');

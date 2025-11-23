-- Model definition for messages
-- Individual messages within conversations

-- Insert model record
INSERT INTO models (model_name, status, description)
  VALUES ('messages', 'active', 'Individual messages within conversations');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('messages', 'conversation_id', 'uuid', 'true', 'Foreign key to conversations table');

INSERT INTO fields (model_name, field_name, type, required, description, enum_values)
  VALUES ('messages', 'role', 'text', 'true', 'Message role', ARRAY['user', 'assistant', 'system', 'tool']);

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('messages', 'content', 'text', 'true', 'Message content (can be large)', 50000);

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('messages', 'tokens', 'integer', 'false', 'Token count for this message', 0, 100000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('messages', 'metadata', 'jsonb', 'false', 'Message metadata (function calls, code blocks, attachments, reasoning traces)');

-- Create the actual table from model definition
SELECT create_table_from_schema('messages');

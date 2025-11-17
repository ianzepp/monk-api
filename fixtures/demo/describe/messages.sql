-- Schema definition for messages
-- Individual messages within conversations

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('messages', 'active', 'Individual messages within conversations');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('messages', 'conversation_id', 'uuid', 'true', 'Foreign key to conversations table');

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('messages', 'role', 'text', 'true', 'Message role', ARRAY['user', 'assistant', 'system', 'tool']);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('messages', 'content', 'text', 'true', 'Message content (can be large)', 50000);

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('messages', 'tokens', 'integer', 'false', 'Token count for this message', 0, 100000);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('messages', 'metadata', 'jsonb', 'false', 'Message metadata (function calls, code blocks, attachments, reasoning traces)');

-- Create the actual table from schema definition
SELECT create_table_from_schema('messages');

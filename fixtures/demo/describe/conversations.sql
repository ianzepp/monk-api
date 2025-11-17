-- Schema definition for conversations
-- LLM conversation history with searchable context

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('conversations', 'active', 'LLM conversation history with searchable context');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('conversations', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('conversations', 'title', 'text', 'true', 'Conversation title', 2, 200);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('conversations', 'context_tags', 'text[]', 'false', 'Tags for semantic search and categorization');

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('conversations', 'participants', 'text[]', 'false', 'List of participant names');

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('conversations', 'summary', 'text', 'false', 'Auto-generated or manual conversation summary', 2000);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('conversations', 'metadata', 'jsonb', 'false', 'LLM metadata (model info, token counts, embeddings reference, conversation type)');

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('conversations', 'started_at', 'timestamp', 'false', 'Timestamp when conversation started');

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('conversations', 'last_message_at', 'timestamp', 'false', 'Timestamp of most recent message');

-- Create the actual table from schema definition
SELECT create_table_from_schema('conversations');

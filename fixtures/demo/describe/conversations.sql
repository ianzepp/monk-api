-- Model definition for conversations
-- LLM conversation history with searchable context

-- Insert model record
INSERT INTO models (model_name, status, description)
  VALUES ('conversations', 'active', 'LLM conversation history with searchable context');

-- Insert field definitions
INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO fields (model_name, field_name, type, required, description, minimum, maximum)
  VALUES ('conversations', 'title', 'text', 'true', 'Conversation title', 2, 200);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'context_tags', 'text[]', 'false', 'Tags for semantic search and categorization');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'participants', 'text[]', 'false', 'List of participant names');

INSERT INTO fields (model_name, field_name, type, required, description, maximum)
  VALUES ('conversations', 'summary', 'text', 'false', 'Auto-generated or manual conversation summary', 2000);

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'metadata', 'jsonb', 'false', 'LLM metadata (model info, token counts, embeddings reference, conversation type)');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'started_at', 'timestamp', 'false', 'Timestamp when conversation started');

INSERT INTO fields (model_name, field_name, type, required, description)
  VALUES ('conversations', 'last_message_at', 'timestamp', 'false', 'Timestamp of most recent message');

-- Create the actual table from model definition
SELECT create_table_from_model('conversations');

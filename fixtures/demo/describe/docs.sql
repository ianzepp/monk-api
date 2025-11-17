-- Schema definition for docs
-- Large text documentation with full-text search capabilities

-- Insert schema record
INSERT INTO schemas (schema_name, status, description)
  VALUES ('docs', 'active', 'Large text documentation with full-text search capabilities');

-- Insert column definitions
INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('docs', 'workspace_id', 'uuid', 'true', 'Foreign key to workspaces table');

INSERT INTO columns (schema_name, column_name, type, required, description, minimum, maximum)
  VALUES ('docs', 'title', 'text', 'true', 'Document title', 2, 200);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('docs', 'content', 'text', 'true', 'Large text content (2KB-50KB, markdown or plain text)', 100000);

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('docs', 'content_type', 'text', 'false', 'Content type/format', ARRAY['markdown', 'plaintext', 'code', 'adr', 'api-spec']);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('docs', 'tags', 'text[]', 'false', 'Document tags for categorization');

INSERT INTO columns (schema_name, column_name, type, required, description, enum_values)
  VALUES ('docs', 'category', 'text', 'false', 'Document category', ARRAY['reference', 'guide', 'adr', 'runbook', 'architecture', 'tutorial']);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('docs', 'author', 'text', 'false', 'Document author name', 100);

INSERT INTO columns (schema_name, column_name, type, required, description, maximum)
  VALUES ('docs', 'version', 'text', 'false', 'Document version', 50);

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('docs', 'metadata', 'jsonb', 'false', 'Document metadata (related_docs, embedding_id, word_count, last_indexed_at)');

INSERT INTO columns (schema_name, column_name, type, required, description)
  VALUES ('docs', 'accessed_at', 'timestamp', 'false', 'Timestamp when document was last accessed (for LRU/popularity tracking)');

-- Create the actual table from schema definition
SELECT create_table_from_schema('docs');

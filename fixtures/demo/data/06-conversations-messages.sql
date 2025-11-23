-- ============================================================================
-- DATA: Conversations and Messages model registration and sample data
-- ============================================================================

-- Register conversations model
INSERT INTO "models" (model_name, status, description)
  VALUES ('conversations', 'active', 'LLM conversation history with searchable context');

-- Register conversations fields
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

-- Register messages model
INSERT INTO "models" (model_name, status, description)
  VALUES ('messages', 'active', 'Individual messages within conversations');

-- Register messages fields
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

-- Sample data for conversations and messages (LLM memory)
-- References workspaces created in 01-workspaces-teams.sql

-- Insert conversations and messages
WITH inserted_conversations AS (
  INSERT INTO conversations (workspace_id, title, context_tags, participants, summary, metadata, started_at, last_message_at)
  SELECT
    w.id,
    c.title,
    c.context_tags,
    c.participants,
    c.summary,
    c.metadata::jsonb,
    w.created_at + (c.start_days || ' days')::interval,
    w.created_at + (c.start_days || ' days')::interval + (c.duration_days || ' hours')::interval
  FROM workspaces w
  CROSS JOIN LATERAL (
    VALUES
      ('API Design Discussion: Authentication Flow', ARRAY['api-design', 'authentication', 'security'], ARRAY['Alice Johnson', 'Claude', 'Bob Martinez'],
       'Discussion about implementing OAuth2 with JWT tokens for the new API',
       '{"model": "claude-3-opus", "total_tokens": 2847, "conversation_type": "technical-discussion"}', '35', '4'),
      ('Debugging Session: Memory Leak Investigation', ARRAY['debugging', 'performance', 'memory'], ARRAY['David Kumar', 'Claude'],
       'Troubleshooting memory leak in background sync process',
       '{"model": "claude-3-sonnet", "total_tokens": 5234, "conversation_type": "debugging"}', '50', '2'),
      ('Code Review: New Navigation Component', ARRAY['code-review', 'frontend', 'react'], ARRAY['Grace Park', 'Claude', 'Frank Chen'],
       'Reviewing React component implementation for new navigation system',
       '{"model": "claude-3-haiku", "total_tokens": 1523, "conversation_type": "code-review"}', '65', '1')
  ) AS c(title, context_tags, participants, summary, metadata, start_days, duration_days)
  WHERE w.slug IN ('acme-corp', 'techstart-labs', 'devtools-inc')
  LIMIT 25

  RETURNING id, workspace_id, title, started_at
)
-- Insert messages for conversations
INSERT INTO messages (conversation_id, role, content, tokens, metadata, created_at)
SELECT
  ic.id,
  m.role,
  m.content,
  m.tokens,
  m.metadata::jsonb,
  ic.started_at + (m.order_seq || ' minutes')::interval
FROM inserted_conversations ic
CROSS JOIN LATERAL (
  VALUES
    ('user', 'We need to implement OAuth2 for the new API. What''s the best approach for token refresh?', 127, '{"intent": "question"}', '0'),
    ('assistant', 'For OAuth2 token refresh, I recommend implementing a refresh token rotation strategy. Here''s why:\n\n1. Security: Each refresh generates a new refresh token\n2. Detection: Enables detection of token theft\n3. Compliance: Meets OWASP recommendations\n\nImplementation approach:\n- Store refresh tokens in secure HttpOnly cookies\n- Implement automatic token refresh 5 minutes before expiry\n- Add retry logic for failed refreshes', 412, '{"code_blocks": 0, "recommendations": 3}', '2'),
    ('user', 'That makes sense. Should we use separate databases for token storage?', 89, '{"intent": "clarification"}', '5'),
    ('assistant', 'For your scale, I''d recommend keeping tokens in the same database but in a separate table with:\n\n- TTL-based cleanup (automatic expiration)\n- Indexed by user_id for fast lookups\n- Encrypted refresh token values\n\nThis simplifies your infrastructure while maintaining security.', 298, '{"recommendations": 3}', '7')
  ) AS m(role, content, tokens, metadata, order_seq)
WHERE ic.title LIKE '%API Design%'

UNION ALL

SELECT ic.id, m.role, m.content, m.tokens, m.metadata::jsonb, ic.started_at + (m.order_seq || ' minutes')::interval
FROM inserted_conversations ic
CROSS JOIN LATERAL (
  VALUES
    ('user', 'The background sync process is consuming 2GB of memory after running for 6 hours. Can you help debug this?', 156, '{"intent": "problem-report", "attachments": ["memory-profile.png"]}', '0'),
    ('assistant', 'Let''s analyze the memory leak systematically:\n\n1. Check for event listener leaks\n2. Inspect closure references\n3. Review timer cleanup\n4. Check for large data structures accumulating\n\nCan you share the sync process code?', 234, '{"checklist_items": 4}', '3'),
    ('user', 'Here''s the sync code: [code snippet]. I notice we''re adding event listeners in a loop without removing them.', 178, '{"code_blocks": 1, "discovery": "event-listeners"}', '8'),
    ('assistant', 'Excellent catch! The issue is on line 45 - you''re adding listeners in the loop without cleanup. Solution:\n\n```javascript\nconst listener = () => handleUpdate(item);\nitem.addEventListener(''update'', listener);\n// Store reference for cleanup\nlistenerMap.set(item.id, listener);\n```\n\nThen add cleanup in your shutdown handler.', 387, '{"code_blocks": 1, "solution_provided": true}', '12')
  ) AS m(role, content, tokens, metadata, order_seq)
WHERE ic.title LIKE '%Debugging%'

UNION ALL

SELECT ic.id, m.role, m.content, m.tokens, m.metadata::jsonb, ic.started_at + (m.order_seq || ' minutes')::interval
FROM inserted_conversations ic
CROSS JOIN LATERAL (
  VALUES
    ('user', 'Can you review this navigation component implementation?', 89, '{"intent": "code-review", "files": ["Navigation.tsx"]}', '0'),
    ('assistant', 'I''ve reviewed the Navigation component. Overall structure is good! A few suggestions:\n\n1. Extract navigation items to a config file\n2. Add keyboard navigation support\n3. Consider memoizing the navigation items\n4. Add loading states for async menu items\n\nThe accessibility attributes look great.', 312, '{"suggestions": 4, "praise": true}', '4'),
    ('user', 'Good points. How should I implement keyboard navigation?', 67, '{"intent": "implementation-question"}', '7'),
    ('assistant', 'For keyboard navigation, add these handlers:\n\n```tsx\nconst handleKeyDown = (e: KeyboardEvent) => {\n  switch(e.key) {\n    case ''ArrowRight'': focusNext(); break;\n    case ''ArrowLeft'': focusPrev(); break;\n    case ''Enter'': activateItem(); break;\n  }\n};\n```\n\nDon''t forget to manage focus with useRef and add tabIndex={0} to focusable items.', 445, '{"code_blocks": 1, "implementation_details": true}', '10')
  ) AS m(role, content, tokens, metadata, order_seq)
WHERE ic.title LIKE '%Code Review%';

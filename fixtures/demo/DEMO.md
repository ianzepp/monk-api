# Demo Fixtures Template

## Purpose

Comprehensive demonstration template designed to support development and testing of monk-* tooling projects (monk-cli, monk-ftp, monk-mcp, etc.). Features realistic data structures with hierarchical relationships, searchable content, and LLM memory integration.

## Design Goals

1. **Tooling Development Support**: Realistic models for testing CLI, FTP, and other tooling workflows
2. **Hierarchical Navigation**: Deep parent-child relationships for filesystem-like operations
3. **Search & Filter Testing**: Array fields, JSON metadata, full-text search scenarios
4. **LLM Memory Integration**: Conversation history and documentation storage with searchable context
5. **Data Variety**: Multiple data types, nullable fields, edge cases, large text content

## Model Overview

**12 models with ~300-500 total records**

### Organization & Teams (3 models)
- **workspaces** (6 records) - Top-level organizations
- **teams** (10 records) - Development teams within workspaces
- **members** (40 records) - Team members

### Development Management (4 models)
- **repositories** (15 records) - Code repositories (GitHub/GitLab style)
- **issues** (50 records) - Issue tracking
- **issue_comments** (80 records) - Comments on issues
- **releases** (25 records) - Software releases and versioning

### Project & Task Management (2 models)
- **projects** (12 records) - Projects and initiatives
- **tasks** (70 records) - Tasks and todos

### LLM Memory & Knowledge (3 models)
- **conversations** (25 records) - Searchable conversation history
- **messages** (150 records) - Individual chat messages
- **docs** (35 records) - Large text documentation with full-text search

---

## Detailed Model Specifications

### 1. workspaces
**Purpose**: Top-level organizational containers

**Fields**:
- `id` (uuid, PK)
- `name` (string) - "Acme Corp", "TechStart Labs"
- `slug` (string) - "acme-corp", "techstart-labs"
- `description` (text)
- `settings` (json) - Theme, preferences, feature flags
- `created_at` (timestamp)

**Records**: 6
**Relationships**: Has many teams, repositories, projects, conversations, docs

---

### 2. teams
**Purpose**: Development teams and groups

**Fields**:
- `id` (uuid, PK)
- `workspace_id` (uuid, FK → workspaces)
- `name` (string) - "Backend Team", "AI/ML Team", "DevOps"
- `description` (text)
- `focus_area` (string) - "backend", "frontend", "ai-ml", "devops", "design"
- `created_at` (timestamp)

**Records**: 10 (1-2 per workspace)
**Relationships**: Belongs to workspace, has many members

---

### 3. members
**Purpose**: Team members and users

**Fields**:
- `id` (uuid, PK)
- `team_id` (uuid, FK → teams)
- `name` (string) - "Alice Johnson", "Bob Smith"
- `email` (string) - "alice@example.com"
- `role` (string) - "lead", "senior", "mid", "junior"
- `timezone` (string) - "America/New_York", "Europe/London"
- `avatar_url` (string, nullable)
- `joined_at` (timestamp)

**Records**: 40 (3-5 per team)
**Relationships**: Belongs to team

---

### 4. repositories
**Purpose**: Code repositories (management layer, not git internals)

**Fields**:
- `id` (uuid, PK)
- `workspace_id` (uuid, FK → workspaces)
- `name` (string) - "monk-api", "monk-cli", "web-dashboard"
- `slug` (string) - "monk-api", "monk-cli"
- `description` (text)
- `visibility` (string) - "public", "private", "internal"
- `primary_language` (string) - "TypeScript", "Python", "Rust"
- `topics` (array) - ["api", "backend", "postgresql"]
- `stars` (integer) - 0-500
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Records**: 15 (2-3 per workspace)
**Relationships**: Belongs to workspace, has many issues, releases

---

### 5. issues
**Purpose**: Issue tracking and bug reports

**Fields**:
- `id` (uuid, PK)
- `repository_id` (uuid, FK → repositories)
- `title` (string) - "Fix authentication timeout"
- `description` (text) - Detailed issue description
- `status` (string) - "open", "in_progress", "closed", "wont_fix"
- `priority` (string) - "critical", "high", "medium", "low"
- `labels` (array) - ["bug", "security", "p1"]
- `assignee` (string, nullable) - Member name
- `reported_by` (string) - Member name
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `closed_at` (timestamp, nullable)

**Records**: 50 (3-4 per repository)
**Relationships**: Belongs to repository, has many issue_comments

---

### 6. issue_comments
**Purpose**: Comments and discussion on issues

**Fields**:
- `id` (uuid, PK)
- `issue_id` (uuid, FK → issues)
- `author` (string) - Member name
- `body` (text) - Comment content
- `created_at` (timestamp)

**Records**: 80 (1-3 per issue, some issues have no comments)
**Relationships**: Belongs to issue

---

### 7. releases
**Purpose**: Software releases, tags, and versioning

**Fields**:
- `id` (uuid, PK)
- `repository_id` (uuid, FK → repositories)
- `version` (string) - "v1.2.3", "2024.11.1"
- `name` (string) - "Winter Release 2024"
- `description` (text) - Release notes
- `tag` (string) - "v1.2.3", "release-2024-11"
- `is_prerelease` (boolean)
- `is_draft` (boolean)
- `published_by` (string) - Member name
- `published_at` (timestamp)
- `created_at` (timestamp)

**Records**: 25 (1-2 per repository)
**Relationships**: Belongs to repository

---

### 8. projects
**Purpose**: Projects and initiatives

**Fields**:
- `id` (uuid, PK)
- `workspace_id` (uuid, FK → workspaces)
- `name` (string) - "Q4 Platform Redesign", "API v2 Migration"
- `description` (text)
- `status` (string) - "planning", "active", "on_hold", "completed"
- `start_date` (date, nullable)
- `end_date` (date, nullable)
- `owner` (string) - Member name
- `tags` (array) - ["infrastructure", "migration"]
- `created_at` (timestamp)

**Records**: 12 (2-3 per workspace)
**Relationships**: Belongs to workspace, has many tasks

---

### 9. tasks
**Purpose**: Tasks, todos, and action items

**Fields**:
- `id` (uuid, PK)
- `project_id` (uuid, FK → projects, nullable) - Can be standalone
- `title` (string) - "Update API documentation"
- `description` (text)
- `status` (string) - "todo", "in_progress", "review", "done", "blocked"
- `priority` (string) - "critical", "high", "medium", "low"
- `assignee` (string, nullable) - Member name
- `due_date` (date, nullable)
- `tags` (array) - ["docs", "urgent"]
- `estimated_hours` (integer, nullable)
- `completed_at` (timestamp, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Records**: 70 (5-8 per project, ~10 standalone without project)
**Relationships**: Belongs to project (optional)

---

### 10. conversations
**Purpose**: LLM conversation history with searchable context

**Fields**:
- `id` (uuid, PK)
- `workspace_id` (uuid, FK → workspaces)
- `title` (string) - "API Design Discussion", "Debug Session: Auth Flow"
- `context_tags` (array) - ["api-design", "authentication", "debugging"]
- `participants` (array) - ["Alice", "ChatGPT", "Bob"]
- `summary` (text, nullable) - Auto-generated or manual summary
- `metadata` (json) - Model info, token counts, embeddings reference, conversation type
- `started_at` (timestamp)
- `last_message_at` (timestamp)

**Records**: 25 (3-5 per workspace)
**Relationships**: Belongs to workspace, has many messages

**LLM Use Cases**:
- Search conversations by tags: `find conversations where context_tags contains "api-design"`
- Find recent conversations: `find conversations order by last_message_at desc`
- Filter by participant: `find conversations where participants contains "Alice"`

---

### 11. messages
**Purpose**: Individual messages within conversations

**Fields**:
- `id` (uuid, PK)
- `conversation_id` (uuid, FK → conversations)
- `role` (string) - "user", "assistant", "system"
- `content` (text) - Message content (can be large)
- `tokens` (integer, nullable) - Token count
- `metadata` (json) - Function calls, code blocks, attachments, reasoning traces
- `created_at` (timestamp)

**Records**: 150 (5-10 per conversation)
**Relationships**: Belongs to conversation

**LLM Use Cases**:
- Full-text search: `find messages where content like "%authentication%"`
- Filter by role: `find messages where role = "assistant"`
- Pagination testing: Large message lists

---

### 12. docs
**Purpose**: Large text documentation with full-text search capabilities

**Fields**:
- `id` (uuid, PK)
- `workspace_id` (uuid, FK → workspaces)
- `title` (string) - "API Reference", "Architecture Decision: Database Sharding"
- `content` (text) - **LARGE TEXT (2KB-50KB per document)** - Markdown, plain text
- `content_type` (string) - "markdown", "plaintext", "code", "adr" (architecture decision record)
- `tags` (array) - ["api", "reference", "public"]
- `category` (string) - "reference", "guide", "adr", "runbook", "architecture"
- `author` (string) - Member name
- `version` (string, nullable) - Document version
- `metadata` (json) - Related docs, embedding_id, word_count, last_indexed_at
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `accessed_at` (timestamp) - For LRU/popularity tracking

**Records**: 35 (5-7 per workspace)
**Relationships**: Belongs to workspace

**LLM Use Cases**:
- Full-text search across large documents: `find docs where content like "%authentication flow%"`
- Search by tags and category: `find docs where tags contains "api" and category = "reference"`
- Recent/popular docs: `find docs order by accessed_at desc`
- Document retrieval for RAG (Retrieval Augmented Generation)

**Test Cases for Large Text**:
- Documents ranging from 2KB to 50KB
- Full-text search performance
- Pagination with large content
- JSON metadata with embedding references

---

## Relationship Diagram

```
workspaces (6)
  │
  ├─ teams (10)
  │   └─ members (40)
  │
  ├─ repositories (15)
  │   ├─ issues (50)
  │   │   └─ issue_comments (80)
  │   └─ releases (25)
  │
  ├─ projects (12)
  │   └─ tasks (70)
  │
  ├─ conversations (25)
  │   └─ messages (150)
  │
  └─ docs (35)
```

**Total Records**: ~508

---

## Data Variety & Edge Cases

### Nullable Fields
- `tasks.project_id` - Standalone tasks without projects
- `tasks.assignee` - Unassigned tasks
- `tasks.due_date` - Tasks without deadlines
- `members.avatar_url` - Members without avatars
- `conversations.summary` - Conversations without summaries

### Array Fields
- `repositories.topics` - Empty arrays, single item, multiple items
- `issues.labels` - Various label combinations
- `tasks.tags` - Task categorization
- `conversations.context_tags` - Semantic tagging
- `conversations.participants` - Multi-participant conversations
- `docs.tags` - Document categorization

### JSON Fields
- `workspaces.settings` - Complex configuration objects
- `conversations.metadata` - LLM-specific metadata (model, tokens, embeddings)
- `messages.metadata` - Function calls, attachments
- `docs.metadata` - Document relationships, embeddings, analytics

### Large Text Content
- `docs.content` - Documents ranging from 2KB to 50KB
- Markdown formatting, code blocks, long technical content
- Full-text search performance testing

### Empty Relationships
- Repositories with no issues
- Issues with no comments
- Projects with minimal tasks
- Conversations with just 1-2 messages

---

## Testing Use Cases

### CLI Testing (monk-cli)
✅ **Filesystem Navigation**: `monk fs ls /data/workspaces/acme-corp/repositories/`
✅ **CRUD Operations**: Create/read/update/delete across all models
✅ **Find/Filter**: Complex queries with arrays, JSON, dates
✅ **Bulk Operations**: Batch updates across models
✅ **Pagination**: Large message lists, issue comments

### FTP Testing (monk-ftp)
✅ **Directory Structure**: Hierarchical navigation via parent-child relationships
✅ **File-like Operations**: Read/write/delete operations
✅ **Large Files**: `docs` model with large text content

### Search/Filter API Testing
✅ **Array Filtering**: Find by tags, labels, participants
✅ **Full-text Search**: Search across messages, docs, descriptions
✅ **Date Ranges**: Filter by created_at, updated_at, accessed_at
✅ **JSON Queries**: Search within metadata fields
✅ **Complex Filters**: Multiple conditions, ordering, pagination

### LLM Integration Testing
✅ **Conversation Storage**: Store and retrieve chat history
✅ **Context Search**: Find relevant conversations by tags/content
✅ **Knowledge Retrieval**: RAG patterns with docs model
✅ **Memory Management**: LRU via accessed_at, confidence scoring
✅ **Cross-model Context**: Link tasks, issues, docs to conversations

---

## Building the Template

```bash
# Create demo template
npm run fixtures:build demo

# Creates: monk_template_demo database

# Use in tests
npm run test:sh spec/demo/

# Register as tenant template
# (Available via /auth/register with template="demo")
```

---

## Comparison with Other Templates

| Template | Models | Records | Use Case |
|----------|---------|---------|----------|
| `empty` | 0 | 0 | Production tenants |
| `testing` | 2 | ~10 | Unit tests (locked) |
| `demo` | 12 | ~500 | Tooling development, LLM integration, full-feature testing |

---

## Notes

- **Iterative Development**: Model designs may evolve as Describe API changes are tested
- **Realistic Data**: Uses realistic names, timestamps, and content
- **Searchable by Default**: All text fields support full-text search
- **LLM-Ready**: Designed to support AI/LLM memory and context retrieval patterns
- **Developer-Focused**: Models familiar to software development teams

---

**Last Updated**: 2025-11-17
**Status**: Design specification (implementation pending)

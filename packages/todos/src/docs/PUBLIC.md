# Todos App

A simple todo list application demonstrating the Monk app package pattern.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/app/todos/` | List all todos |
| POST | `/app/todos/` | Create a new todo |
| GET | `/app/todos/:id` | Get a single todo |
| PUT | `/app/todos/:id` | Update a todo |
| DELETE | `/app/todos/:id` | Delete a todo |
| POST | `/app/todos/:id/complete` | Mark todo as complete |
| POST | `/app/todos/:id/reopen` | Reopen a completed todo |

## Query Parameters

### GET /app/todos/

- `status` - Filter by status (pending, in_progress, completed)

## Model

The `todos` model has the following fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| title | text | yes | - | Short title describing the task |
| description | text | no | - | Detailed description |
| status | text | no | pending | Current status |
| priority | text | no | medium | Priority level (low, medium, high) |
| due_date | timestamp | no | - | When the task should be completed |
| completed_at | timestamp | no | - | When the task was marked complete |

## Examples

### Create a todo

```bash
curl -X POST /app/todos/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Write documentation", "priority": "high"}'
```

### List pending todos

```bash
curl "/app/todos/?status=pending" \
  -H "Authorization: Bearer $TOKEN"
```

### Mark complete

```bash
curl -X POST /app/todos/:id/complete \
  -H "Authorization: Bearer $TOKEN"
```

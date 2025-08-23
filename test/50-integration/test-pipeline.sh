#!/bin/bash
set -e

# CLI Test Pipeline - Automated end-to-end testing
# Tests the complete schema creation -> data operations workflow

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# Test schema YAML content
TASK_SCHEMA='title: Task
description: Simple task management schema
type: object
properties:
  title:
    type: string
    minLength: 1
    maxLength: 200
    description: Task title
  description:
    type: string
    maxLength: 1000
    description: Detailed task description
  status:
    type: string
    enum: ["pending", "in_progress", "completed", "cancelled"]
    default: "pending"
    description: Current task status
  priority:
    type: string
    enum: ["low", "medium", "high", "urgent"]
    default: "medium"
    description: Task priority level
  due_date:
    type: string
    format: date-time
    description: Task due date
  assigned_to:
    type: string
    format: uuid
    description: User ID assigned to this task
required:
  - title'

# Test record JSON content
TASK_RECORD='{"title": "Test CLI Pipeline", "description": "End-to-end test of the PaaS system", "priority": "high"}'

# Load authentication helper
source "$(dirname "$0")/../auth-helper.sh"

echo "=== CLI Pipeline Test ==="
echo

# Step 0.5: Authenticate and verify connectivity
if ! authenticate_and_ping "pipeline"; then
    print_error "Initial authentication and connectivity check failed"
    exit 1
fi
echo

# Step 0: Cleanup - remove task schema if it exists
print_step "Cleaning up existing test data"
if monk meta list schema -e name | grep -wq "task"; then
    echo "Removing existing task schema..."
    monk meta delete schema task -v 2>/dev/null || true
fi
echo

# Step 1: Clean slate - check current schemas
print_step "Checking current schemas"
CURRENT_SCHEMAS=$(monk meta list schema -e name | xargs)
echo "Current schemas: $CURRENT_SCHEMAS"
echo

# Step 2: Create task schema
print_step "Creating task schema"
if SCHEMA_RESPONSE=$(echo "$TASK_SCHEMA" | monk meta create schema); then
    SCHEMA_ID=$(echo "$SCHEMA_RESPONSE" | jq -r '.id')
    print_success "Schema created with ID: $SCHEMA_RESPONSE"
else
    print_error "Schema creation failed"
fi
echo

# Step 3: Verify schema appears in list
print_step "Verifying schema registration"
UPDATED_SCHEMAS=$(monk meta list schema -e name | xargs)
echo "Updated schemas: $UPDATED_SCHEMAS"
if echo "$UPDATED_SCHEMAS" | grep -wq "task"; then
    print_success "Task schema is registered"
else
    print_error "Task schema not found in registry"
fi
echo

# Step 4: Create a task record
print_step "Creating task record"
if RECORD_RESPONSE=$(echo "$TASK_RECORD" | monk data create task); then
    RECORD_ID=$(echo "$RECORD_RESPONSE" | jq -r '.id')
    print_success "Task record created with ID: $RECORD_RESPONSE"
else
    print_error "Record creation failed"
fi
echo

# Step 5: Verify record exists
print_step "Verifying record retrieval"
if RECORD_RETRIEVAL_RESPONSE=$(monk data get task "$RECORD_ID"); then
    RECORD_TITLE=$(echo "$RECORD_RETRIEVAL_RESPONSE" | jq -r '.title')
    print_success "Retrieved record: '$RECORD_TITLE'"
else
    print_error "Record retrieval failed"
fi
echo

# Step 6: List all tasks
print_step "Listing all task records"
TASK_LIST_RESPONSE=$(monk data list task)
RECORD_COUNT=$(echo "$TASK_LIST_RESPONSE" | jq 'length')
print_success "Found $RECORD_COUNT task records"
echo

# Step 7: Update the task
print_step "Updating task record"
UPDATE_DATA='{"status": "completed", "description": "Successfully tested the CLI pipeline!"}'
if echo "$UPDATE_DATA" | monk data update task "$RECORD_ID" -x; then
    print_success "Task updated successfully (timestamp updated)"
    NEW_STATUS="updated"
else
    print_error "Record update failed"
fi
echo

print_success "✨ Complete pipeline test successful!"

# Cleanup
cleanup_auth

echo
echo "Summary:"
echo "  Schema ID: $SCHEMA_ID"
echo "  Record ID: $RECORD_ID"
echo "  Final Status: $NEW_STATUS"
echo "  Available schemas: $UPDATED_SCHEMAS"
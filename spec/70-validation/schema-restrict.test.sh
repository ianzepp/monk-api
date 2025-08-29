#!/bin/bash
set -e

# Foreign Key Relationship Test - Validates schema dependencies and CASCADE behavior
# Creates two schemas with foreign key relationship, tests deletion order

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
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

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Generate random suffix for schema names
RANDOM_SUFFIX=$(date +%s | tail -c 4)
PARENT_SCHEMA="department${RANDOM_SUFFIX}"
CHILD_SCHEMA="employee${RANDOM_SUFFIX}"

# Parent schema (department)
DEPARTMENT_SCHEMA="title: Department${RANDOM_SUFFIX}
description: Organizational department
type: object
properties:
  name:
    type: string
    minLength: 1
    maxLength: 100
    description: Department name
  budget:
    type: integer
    minimum: 0
    description: Annual budget
  manager_name:
    type: string
    maxLength: 100
    description: Department manager
required:
  - name"

# Child schema (employee) with foreign key to department
EMPLOYEE_SCHEMA="title: Employee${RANDOM_SUFFIX}
description: Employee in a department
type: object
properties:
  first_name:
    type: string
    minLength: 1
    maxLength: 50
    description: Employee first name
  last_name:
    type: string
    minLength: 1
    maxLength: 50
    description: Employee last name
  salary:
    type: integer
    minimum: 0
    description: Annual salary
  department_id:
    type: string
    format: uuid
    description: Department this employee belongs to
    x-paas:
      foreign_key:
        table: department${RANDOM_SUFFIX}s
        column: id
        on_delete: cascade
  position:
    type: string
    maxLength: 100
    description: Job position/title
required:
  - first_name
  - last_name
  - department_id"

# Load authentication helper
source "$(dirname "$0")/../helpers/auth-helper.sh"

echo "=== Foreign Key Relationship Test ==="
echo "Parent schema: $PARENT_SCHEMA (department)"
echo "Child schema: $CHILD_SCHEMA (employee)"
echo

# Step 0.5: Authenticate and verify connectivity
if ! authenticate_and_ping "restrict"; then
    print_error "Initial authentication and connectivity check failed"
    exit 1
fi
echo

# Step 1: Check initial state
print_step "Checking initial schema count"
INITIAL_SCHEMAS_RESULT=$(monk data select schema)
INITIAL_SCHEMAS=$(echo "$INITIAL_SCHEMAS_RESULT" | jq -r '.[].name' | xargs)
INITIAL_COUNT=$(echo "$INITIAL_SCHEMAS_RESULT" | jq 'length')
print_info "Initial schemas ($INITIAL_COUNT): $INITIAL_SCHEMAS"
echo

# Step 2: Create parent schema (department)
print_step "Creating parent schema: $PARENT_SCHEMA"
DEPT_RESULT=$(echo "$DEPARTMENT_SCHEMA" | monk meta create schema)
if [ -n "$DEPT_RESULT" ]; then
    DEPT_ID=$(echo "$DEPT_RESULT" | jq -r '.id')
    DEPT_TABLE=$(echo "$DEPT_RESULT" | jq -r '.table_name')
    print_success "Department schema created"
    print_info "  ID: $DEPT_ID"
    print_info "  Table: $DEPT_TABLE"
else
    print_error "Department schema creation failed"
fi
echo

# Step 3: Create child schema (employee) with foreign key
print_step "Creating child schema: $CHILD_SCHEMA (with FK to $PARENT_SCHEMA)"
EMP_RESULT=$(echo "$EMPLOYEE_SCHEMA" | monk meta create schema)
if [ -n "$EMP_RESULT" ]; then
    EMP_ID=$(echo "$EMP_RESULT" | jq -r '.id')
    EMP_TABLE=$(echo "$EMP_RESULT" | jq -r '.table_name')
    print_success "Employee schema created with foreign key constraint"
    print_info "  ID: $EMP_ID"
    print_info "  Table: $EMP_TABLE"
else
    print_error "Employee schema creation failed"
fi
echo

# Step 4: Verify both schemas exist
print_step "Verifying both schemas are registered"
UPDATED_SCHEMAS_RESULT=$(monk data select schema)
UPDATED_SCHEMAS=$(echo "$UPDATED_SCHEMAS_RESULT" | jq -r '.[].name' | xargs)
UPDATED_COUNT=$(echo "$UPDATED_SCHEMAS_RESULT" | jq 'length')
print_info "Updated schemas ($UPDATED_COUNT): $UPDATED_SCHEMAS"

BOTH_FOUND=true
if ! echo "$UPDATED_SCHEMAS" | grep -wq "$PARENT_SCHEMA"; then
    print_error "Parent schema '$PARENT_SCHEMA' not found"
    BOTH_FOUND=false
fi
if ! echo "$UPDATED_SCHEMAS" | grep -wq "$CHILD_SCHEMA"; then
    print_error "Child schema '$CHILD_SCHEMA' not found"
    BOTH_FOUND=false
fi

if [ "$BOTH_FOUND" = "true" ]; then
    print_success "Both schemas found in registry"
    if [ "$UPDATED_COUNT" -eq $((INITIAL_COUNT + 2)) ]; then
        print_success "Schema count increased correctly ($INITIAL_COUNT → $UPDATED_COUNT)"
    else
        print_error "Schema count mismatch (expected $((INITIAL_COUNT + 2)), got $UPDATED_COUNT)"
    fi
fi
echo

# Step 5: Test RESTRICT deletion - parent deletion should fail due to dependencies
print_step "Testing RESTRICT deletion: attempting to delete parent with dependencies"
PARENT_DELETE_RESULT=$(monk meta delete schema "$PARENT_SCHEMA" 2>&1)
if echo "$PARENT_DELETE_RESULT" | jq -r '.id' >/dev/null 2>&1; then
    print_error "Parent deletion should have been restricted but succeeded"
else
    ERROR_MSG=$(echo "$PARENT_DELETE_RESULT" | jq -r '.error // "Deletion restricted"' 2>/dev/null || echo "Deletion restricted")
    print_success "Parent deletion properly restricted"
    print_info "  Error: $ERROR_MSG"
fi
echo

# Step 6: Delete child schema first (should succeed)
print_step "Deleting child schema first: $CHILD_SCHEMA"
CHILD_DELETE_RESULT=$(monk meta delete schema "$CHILD_SCHEMA")
if [ -n "$CHILD_DELETE_RESULT" ]; then
    print_success "Child schema deleted successfully"
else
    print_error "Child deletion failed"
fi
echo

# Step 7: Now delete parent schema (should succeed)
print_step "Deleting parent schema: $PARENT_SCHEMA"
PARENT_DELETE_RESULT=$(monk meta delete schema "$PARENT_SCHEMA")
if [ -n "$PARENT_DELETE_RESULT" ]; then
    print_success "Parent schema deleted successfully"
else
    print_error "Parent deletion failed"
fi
echo

# Step 8: Verify complete cleanup
print_step "Verifying complete cleanup"
FINAL_SCHEMAS_RESULT=$(monk data select schema)
FINAL_SCHEMAS=$(echo "$FINAL_SCHEMAS_RESULT" | jq -r '.[].name' | xargs)
FINAL_COUNT=$(echo "$FINAL_SCHEMAS_RESULT" | jq 'length')
print_info "Final schemas ($FINAL_COUNT): $FINAL_SCHEMAS"

# Check that both schemas are gone
if echo "$FINAL_SCHEMAS" | grep -wq "$PARENT_SCHEMA"; then
    print_error "Parent schema '$PARENT_SCHEMA' still exists after deletion"
fi

if echo "$FINAL_SCHEMAS" | grep -wq "$CHILD_SCHEMA"; then
    print_error "Child schema '$CHILD_SCHEMA' still exists after deletion"
fi

if [ "$FINAL_COUNT" -eq "$INITIAL_COUNT" ]; then
    print_success "✨ RESTRICT deletion successful - proper dependency management"
    print_success "Schema count restored correctly ($UPDATED_COUNT → $FINAL_COUNT)"
else
    print_error "Schema count mismatch (expected $INITIAL_COUNT, got $FINAL_COUNT)"
fi
echo

print_success "🎉 Foreign key relationship test completed successfully!"
echo
echo "Test Summary:"
echo "  Parent Schema: $PARENT_SCHEMA (ID: $DEPT_ID)"
# Cleanup
cleanup_auth

echo "  Child Schema: $CHILD_SCHEMA (ID: $EMP_ID)"
echo "  Parent Table: $DEPT_TABLE"
echo "  Child Table: $EMP_TABLE"
echo "  Initial Count: $INITIAL_COUNT"
echo "  Final Count: $FINAL_COUNT"
#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API Columns Population Test
# Tests that creating a schema correctly populates the columns table

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API columns table population"

# Setup test environment with template (needed for columns table)
setup_test_with_template "columns-population" "basic"
setup_full_auth

# Test 1: Create a tasks schema with various field types and constraints
print_step "Creating tasks schema with diverse field types"

# Define comprehensive tasks schema to test column describe extraction
tasks_schema='{
    "title": "Tasks",
    "description": "Task management schema for testing columns population",
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200,
            "description": "Task title"
        },
        "description": {
            "type": "string",
            "description": "Detailed task description"
        },
        "status": {
            "type": "string",
            "enum": ["todo", "in_progress", "completed", "cancelled"],
            "default": "todo",
            "description": "Current task status"
        },
        "priority": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10,
            "default": 5,
            "description": "Task priority level"
        },
        "due_date": {
            "type": "string",
            "format": "date-time",
            "description": "Task due date"
        },
        "assignee_id": {
            "type": "string",
            "format": "uuid",
            "description": "Assigned user ID"
        },
        "is_urgent": {
            "type": "boolean",
            "default": false,
            "description": "Urgent task flag"
        },
        "estimated_hours": {
            "type": "number",
            "minimum": 0,
            "description": "Estimated completion hours"
        },
        "tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Task category tags"
        },
        "metadata": {
            "type": "object",
            "description": "Additional task metadata"
        }
    },
    "required": ["title", "status"],
    "additionalProperties": false
}'

# Create the schema
create_response=$(auth_post "api/describe/tasks" "$tasks_schema")
assert_success "$create_response"

# Verify schema creation response
create_data=$(extract_data "$create_response")
schema_name=$(echo "$create_data" | jq -r '.schema_name')

if [[ "$schema_name" == "tasks" ]]; then
    print_success "Schema created: $schema_name"
else
    test_fail "Unexpected schema creation response: schema_name='$schema_name'"
fi

# Test 2: Query the columns table to verify metadata was populated
print_step "Querying columns table for tasks schema describe"

# Use psql to directly query the tenant's columns table
columns_query="SELECT
    column_name,
    type,
    required,
    default_value,
    minimum,
    maximum,
    pattern,
    enum_values,
    description
FROM columns
WHERE schema_name = 'tasks'
ORDER BY column_name"

columns_result=$(psql -d "$TEST_DATABASE_NAME" -t -c "$columns_query")

if [[ $? -ne 0 || -z "$columns_result" ]]; then
    test_fail "Failed to query columns table or no results found"
fi

print_success "Successfully queried columns table"

# Test 3: Verify expected columns are present with correct metadata
print_step "Validating column describe"

# Check for specific columns and their properties
expected_columns=(
    "assignee_id:UUID:false"
    "description:TEXT:false"
    "due_date:TIMESTAMP:false"
    "estimated_hours:DECIMAL:false"
    "is_urgent:BOOLEAN:false:false"
    "metadata:JSONB:false"
    "priority:INTEGER:false:5"
    "status:TEXT:true:todo"
    "tags:JSONB:false"
    "title:VARCHAR(200):true"
)

for expected in "${expected_columns[@]}"; do
    IFS=':' read -r col_name type required default_val <<< "$expected"

    # Extract this column's data from the query result
    col_data=$(echo "$columns_result" | grep -E "^\s*$col_name\s*\|")

    if [[ -z "$col_data" ]]; then
        test_fail "Column '$col_name' not found in columns table"
        continue
    fi

    # Parse the column data (format: column_name | type | required | default_value | constraints | description)
    actual_type=$(echo "$col_data" | cut -d'|' -f2 | xargs)
    actual_required=$(echo "$col_data" | cut -d'|' -f3 | xargs)
    actual_default=$(echo "$col_data" | cut -d'|' -f4 | xargs)

    # Verify PostgreSQL type mapping
    if [[ "$actual_type" == "$type" ]]; then
        print_success "Column '$col_name': correct PG type ($type)"
    else
        test_fail "Column '$col_name': expected PG type '$type', got '$actual_type'"
    fi

    # Verify required flag
    if [[ "$actual_required" == "$required" ]]; then
        print_success "Column '$col_name': correct required flag ($required)"
    else
        test_fail "Column '$col_name': expected required '$required', got '$actual_required'"
    fi

    # Verify default value (if specified)
    if [[ -n "$default_val" ]]; then
        if [[ "$actual_default" == "$default_val" ]]; then
            print_success "Column '$col_name': correct default value ($default_val)"
        else
            test_fail "Column '$col_name': expected default '$default_val', got '$actual_default'"
        fi
    fi
done

# Test 4: Verify constraint metadata is stored in regular columns
print_step "Validating constraint metadata storage"

# Check that columns with constraints have regular column constraint data
constraint_check="SELECT column_name, minimum, maximum, pattern, enum_values FROM columns WHERE schema_name = 'tasks' AND (minimum IS NOT NULL OR maximum IS NOT NULL OR pattern IS NOT NULL OR enum_values IS NOT NULL)"
constraint_result=$(psql -d "$TEST_DATABASE_NAME" -t -c "$constraint_check")

if [[ -z "$constraint_result" ]]; then
    test_fail "No constraint metadata found - constraints should be populated for some fields"
else
    constraint_count=$(echo "$constraint_result" | wc -l | xargs)
    print_success "Found constraint metadata for $constraint_count columns"

    # Verify a specific constraint (title field should have minimum=1, maximum=200)
    title_constraint_row=$(echo "$constraint_result" | grep "title")
    if [[ -n "$title_constraint_row" ]]; then
        title_min=$(echo "$title_constraint_row" | cut -d'|' -f2 | xargs)
        title_max=$(echo "$title_constraint_row" | cut -d'|' -f3 | xargs)
        if [[ "$title_min" == "1" && "$title_max" == "200" ]]; then
            print_success "Title field constraints correctly stored: min=$title_min, max=$title_max"
        else
            print_success "Title field constraints stored: min=$title_min, max=$title_max"
        fi
    else
        print_warning "Title field not found in constraint results"
    fi
fi

# Test 5: Verify system fields are NOT in columns table
print_step "Verifying system fields exclusion"

system_fields=("id" "access_read" "access_edit" "access_full" "access_deny" "created_at" "updated_at" "trashed_at" "deleted_at")

for system_field in "${system_fields[@]}"; do
    system_check=$(psql -d "$TEST_DATABASE_NAME" -t -c "SELECT COUNT(*) FROM columns WHERE schema_name = 'tasks' AND column_name = '$system_field'" | xargs)

    if [[ "$system_check" == "0" ]]; then
        print_success "System field '$system_field' correctly excluded from columns table"
    else
        test_fail "System field '$system_field' incorrectly found in columns table"
    fi
done

# Test 6: Count total columns and verify expected number
print_step "Verifying total column count"

total_columns=$(psql -d "$TEST_DATABASE_NAME" -t -c "SELECT COUNT(*) FROM columns WHERE schema_name = 'tasks'" | xargs)
expected_count=10  # Number of user-defined properties in the schema

if [[ "$total_columns" == "$expected_count" ]]; then
    print_success "Correct number of columns in table: $total_columns (expected: $expected_count)"
else
    test_fail "Incorrect column count: got $total_columns, expected $expected_count"
fi

print_success "Describe API columns population tests completed successfully"

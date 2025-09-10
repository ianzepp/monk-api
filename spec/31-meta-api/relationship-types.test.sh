#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API x-monk-relationship Test
# Tests that owned and referenced relationship types are correctly parsed and stored

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API x-monk-relationship types"

# Setup test environment with template (needed for columns table)
setup_test_with_template "relationship-types" "basic"
setup_admin_auth

# Test 1: Create a schema with both owned and referenced relationships
print_step "Creating schema with owned and referenced relationships"

# Define comprehensive relationship test schema
relationship_schema='{
    "title": "Comments",
    "description": "Comments with both owned and referenced relationships",
    "type": "object",
    "properties": {
        "text": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1000,
            "description": "Comment content"
        },
        "post_id": {
            "type": "string",
            "format": "uuid",
            "description": "Parent post (owned relationship)",
            "x-monk-relationship": {
                "type": "owned",
                "schema": "posts",
                "name": "comments",
                "cascadeDelete": true,
                "required": true
            }
        },
        "author_id": {
            "type": "string",
            "format": "uuid",
            "description": "Comment author (referenced relationship)",
            "x-monk-relationship": {
                "type": "referenced",
                "schema": "users",
                "name": "author",
                "cascadeDelete": false,
                "required": false
            }
        },
        "parent_comment_id": {
            "type": "string",
            "format": "uuid",
            "description": "Parent comment for threaded comments (owned with custom column)",
            "x-monk-relationship": {
                "type": "owned",
                "schema": "comments",
                "name": "replies",
                "column": "id"
            }
        }
    },
    "required": ["text", "post_id"],
    "additionalProperties": false
}'

# Create the schema
create_response=$(auth_post "api/describe/comments" "$relationship_schema")
assert_success "$create_response"

# Verify schema creation response
create_data=$(extract_data "$create_response")
schema_name=$(echo "$create_data" | jq -r '.name')
table_name=$(echo "$create_data" | jq -r '.table')

if [[ "$schema_name" == "comments" && "$table_name" == "comments" ]]; then
    print_success "Schema created: $schema_name → $table_name"
else
    test_fail "Unexpected schema creation response: name='$schema_name' table='$table_name'"
fi

# Test 2: Query the columns table to verify relationship metadata
print_step "Querying columns table for relationship metadata"

# Use psql to query relationship columns specifically
relationship_query="SELECT
    column_name,
    pg_type,
    relationship_type,
    related_schema,
    relationship_name,
    cascade_delete,
    required_relationship
FROM columns
WHERE schema_name = 'comments' AND relationship_type IS NOT NULL
ORDER BY column_name"

relationship_result=$(psql -d "$TEST_DATABASE_NAME" -t -c "$relationship_query")

if [[ $? -ne 0 || -z "$relationship_result" ]]; then
    test_fail "Failed to query relationship columns or no relationships found"
fi

print_success "Successfully queried relationship columns"

# Test 3: Verify owned relationship (post_id)
print_step "Validating owned relationship metadata"

post_id_row=$(echo "$relationship_result" | grep "post_id")
if [[ -z "$post_id_row" ]]; then
    test_fail "post_id relationship not found in columns table"
fi

# Parse post_id relationship data
post_id_data=($post_id_row)
post_relationship_type=$(echo "$post_id_row" | cut -d'|' -f3 | xargs)
post_related_schema=$(echo "$post_id_row" | cut -d'|' -f4 | xargs)
post_relationship_name=$(echo "$post_id_row" | cut -d'|' -f5 | xargs)
post_cascade_delete=$(echo "$post_id_row" | cut -d'|' -f6 | xargs)
post_required_relationship=$(echo "$post_id_row" | cut -d'|' -f7 | xargs)

# Verify owned relationship properties
if [[ "$post_relationship_type" == "owned" ]]; then
    print_success "post_id: correct relationship type (owned)"
else
    test_fail "post_id: expected relationship type 'owned', got '$post_relationship_type'"
fi

if [[ "$post_related_schema" == "posts" ]]; then
    print_success "post_id: correct related schema (posts)"
else
    test_fail "post_id: expected related schema 'posts', got '$post_related_schema'"
fi

if [[ "$post_relationship_name" == "comments" ]]; then
    print_success "post_id: correct relationship name (comments)"
else
    test_fail "post_id: expected relationship name 'comments', got '$post_relationship_name'"
fi

if [[ "$post_cascade_delete" == "t" ]]; then
    print_success "post_id: correct cascade delete (true)"
else
    test_fail "post_id: expected cascade delete 'true', got '$post_cascade_delete'"
fi

if [[ "$post_required_relationship" == "t" ]]; then
    print_success "post_id: correct required relationship (true)"
else
    test_fail "post_id: expected required relationship 'true', got '$post_required_relationship'"
fi

# Test 4: Verify referenced relationship (author_id)
print_step "Validating referenced relationship metadata"

author_id_row=$(echo "$relationship_result" | grep "author_id")
if [[ -z "$author_id_row" ]]; then
    test_fail "author_id relationship not found in columns table"
fi

# Parse author_id relationship data
author_relationship_type=$(echo "$author_id_row" | cut -d'|' -f3 | xargs)
author_related_schema=$(echo "$author_id_row" | cut -d'|' -f4 | xargs)
author_relationship_name=$(echo "$author_id_row" | cut -d'|' -f5 | xargs)
author_cascade_delete=$(echo "$author_id_row" | cut -d'|' -f6 | xargs)
author_required_relationship=$(echo "$author_id_row" | cut -d'|' -f7 | xargs)

# Verify referenced relationship properties
if [[ "$author_relationship_type" == "referenced" ]]; then
    print_success "author_id: correct relationship type (referenced)"
else
    test_fail "author_id: expected relationship type 'referenced', got '$author_relationship_type'"
fi

if [[ "$author_related_schema" == "users" ]]; then
    print_success "author_id: correct related schema (users)"
else
    test_fail "author_id: expected related schema 'users', got '$author_related_schema'"
fi

if [[ "$author_relationship_name" == "author" ]]; then
    print_success "author_id: correct relationship name (author)"
else
    test_fail "author_id: expected relationship name 'author', got '$author_relationship_name'"
fi

if [[ "$author_cascade_delete" == "f" ]]; then
    print_success "author_id: correct cascade delete (false)"
else
    test_fail "author_id: expected cascade delete 'false', got '$author_cascade_delete'"
fi

if [[ "$author_required_relationship" == "f" ]]; then
    print_success "author_id: correct required relationship (false)"
else
    test_fail "author_id: expected required relationship 'false', got '$author_required_relationship'"
fi

# Test 5: Verify self-referential owned relationship (parent_comment_id)
print_step "Validating self-referential owned relationship"

parent_comment_row=$(echo "$relationship_result" | grep "parent_comment_id")
if [[ -z "$parent_comment_row" ]]; then
    test_fail "parent_comment_id relationship not found in columns table"
fi

# Parse parent_comment_id relationship data
parent_relationship_type=$(echo "$parent_comment_row" | cut -d'|' -f3 | xargs)
parent_related_schema=$(echo "$parent_comment_row" | cut -d'|' -f4 | xargs)
parent_relationship_name=$(echo "$parent_comment_row" | cut -d'|' -f5 | xargs)

# Verify self-referential relationship properties
if [[ "$parent_relationship_type" == "owned" ]]; then
    print_success "parent_comment_id: correct relationship type (owned)"
else
    test_fail "parent_comment_id: expected relationship type 'owned', got '$parent_relationship_type'"
fi

if [[ "$parent_related_schema" == "comments" ]]; then
    print_success "parent_comment_id: correct self-referential schema (comments)"
else
    test_fail "parent_comment_id: expected related schema 'comments', got '$parent_related_schema'"
fi

if [[ "$parent_relationship_name" == "replies" ]]; then
    print_success "parent_comment_id: correct relationship name (replies)"
else
    test_fail "parent_comment_id: expected relationship name 'replies', got '$parent_relationship_name'"
fi

# Test 6: Verify relationship count
print_step "Verifying total relationship count"

relationship_count=$(echo "$relationship_result" | wc -l | xargs)
expected_relationships=3  # post_id, author_id, parent_comment_id

if [[ "$relationship_count" == "$expected_relationships" ]]; then
    print_success "Correct number of relationships: $relationship_count (expected: $expected_relationships)"
else
    test_fail "Incorrect relationship count: got $relationship_count, expected $expected_relationships"
fi

# Test 7: Verify non-relationship columns are not included
print_step "Verifying non-relationship columns excluded from relationship query"

text_in_results=$(echo "$relationship_result" | grep "text" || echo "")
if [[ -z "$text_in_results" ]]; then
    print_success "Non-relationship column 'text' correctly excluded from relationship results"
else
    test_fail "Non-relationship column 'text' incorrectly included in relationship results"
fi

print_success "Describe API x-monk-relationship tests completed successfully"

#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API Nested Relationships Test
# Tests the GET /api/data/:schema/:record/:relationship endpoint

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API nested relationship endpoints"

# Setup test environment with template (needed for columns table)
setup_test_with_template "$(basename "$0" .test.sh)" "empty"
setup_full_auth
setup_sudo_auth "Creating posts and comments schemas with relationships"

# Test 1: Create parent schema (posts)
print_step "Creating posts schema"

posts_schema='{
    "columns": [
        {
            "column_name": "title",
            "type": "text",
            "required": true,
            "minimum": 1,
            "maximum": 200,
            "description": "Post title"
        },
        {
            "column_name": "content",
            "type": "text",
            "required": false,
            "description": "Post content"
        },
        {
            "column_name": "published",
            "type": "boolean",
            "required": false,
            "default_value": false,
            "description": "Whether post is published"
        }
    ]
}'

create_posts_response=$(sudo_post "api/describe/posts" "$posts_schema")
assert_success "$create_posts_response"

posts_data=$(extract_data "$create_posts_response")
if [[ "$(echo "$posts_data" | jq -r '.name')" == "posts" ]]; then
    print_success "Posts schema created successfully"
else
    test_fail "Failed to create posts schema"
fi

# Test 2: Create child schema with owned relationship (comments)
print_step "Creating comments schema with owned relationship to posts"

comments_schema='{
    "columns": [
        {
            "column_name": "text",
            "type": "text",
            "required": true,
            "minimum": 1,
            "maximum": 1000,
            "description": "Comment text"
        },
        {
            "column_name": "post_id",
            "type": "uuid",
            "required": true,
            "description": "Parent post reference",
            "relationship_type": "owned",
            "related_schema": "posts",
            "relationship_name": "comments",
            "cascade_delete": true,
            "required_relationship": true
        }
    ]
}'

create_comments_response=$(sudo_post "api/describe/comments" "$comments_schema")
assert_success "$create_comments_response"

comments_data=$(extract_data "$create_comments_response")
if [[ "$(echo "$comments_data" | jq -r '.name')" == "comments" ]]; then
    print_success "Comments schema created with relationship"
else
    test_fail "Failed to create comments schema"
fi

# Test 3: Create test data - parent post
print_step "Creating test post record"

test_post='[{
    "title": "Test Blog Post",
    "content": "This is a test post for relationship testing",
    "published": true
}]'

create_post_response=$(auth_post "api/data/posts" "$test_post")
assert_success "$create_post_response"

post_records=$(extract_data "$create_post_response")
post_id=$(echo "$post_records" | jq -r '.[0].id')

if [[ -n "$post_id" && "$post_id" != "null" ]]; then
    print_success "Test post created with ID: $post_id"
else
    test_fail "Failed to create test post or get post ID"
fi

# Test 4: Create test data - child comments
print_step "Creating test comment records"

comments_data='[
    {"text": "Great post!", "post_id": "'$post_id'"},
    {"text": "Very informative, thanks!", "post_id": "'$post_id'"},
    {"text": "Looking forward to more content.", "post_id": "'$post_id'"}
]'

create_comments_response=$(auth_post "api/data/comments" "$comments_data")
assert_success "$create_comments_response"
comments_records=$(extract_data "$create_comments_response")

comment1_id=$(echo "$comments_records" | jq -r '.[0].id')
comment2_id=$(echo "$comments_records" | jq -r '.[1].id')
comment3_id=$(echo "$comments_records" | jq -r '.[2].id')

print_success "Created 3 test comments: $comment1_id, $comment2_id, $comment3_id"

# Test 5: Test the nested relationship endpoint
print_step "Testing GET /api/data/posts/$post_id/comments"

relationship_response=$(auth_get "api/data/posts/$post_id/comments")
assert_success "$relationship_response"

relationship_data=$(extract_data "$relationship_response")

# Verify we got an array of comments
comment_count=$(echo "$relationship_data" | jq 'length')
if [[ "$comment_count" == "3" ]]; then
    print_success "Relationship endpoint returned 3 comments as expected"
else
    test_fail "Expected 3 comments, got: $comment_count"
fi

# Verify comments have correct post_id
all_have_correct_post_id=$(echo "$relationship_data" | jq --arg post_id "$post_id" 'all(.post_id == $post_id)')
if [[ "$all_have_correct_post_id" == "true" ]]; then
    print_success "All returned comments have correct post_id"
else
    test_fail "Some comments have incorrect post_id"
fi

# Verify comment content
comment_texts=$(echo "$relationship_data" | jq -r '.[].text' | sort)
expected_texts=$(echo -e "Great post!\nLooking forward to more content.\nVery informative, thanks!" | sort)

if [[ "$comment_texts" == "$expected_texts" ]]; then
    print_success "All comment texts match expected content"
else
    print_error "Comment texts don't match expected content"
    print_error "Expected: $expected_texts"
    print_error "Got: $comment_texts"
    test_fail "Comment text mismatch"
fi

# Test 6: Test with non-existent parent
print_step "Testing relationship endpoint with non-existent parent"

fake_uuid="00000000-1111-2222-3333-444444444444"
nonexistent_response=$(auth_get "api/data/posts/$fake_uuid/comments" 2>/dev/null || echo '{"success": false}')

if echo "$nonexistent_response" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent parent correctly returns error"
else
    test_fail "Non-existent parent should return error"
fi

# Test 7: Test with non-existent relationship
print_step "Testing with non-existent relationship name"

invalid_relationship_response=$(auth_get "api/data/posts/$post_id/nonexistent" 2>/dev/null || echo '{"success": false}')

if echo "$invalid_relationship_response" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent relationship correctly returns error"
else
    test_fail "Non-existent relationship should return error"
fi

# Test 8: Test with parent that has no children
print_step "Testing parent with no children (empty result)"

# Create another post with no comments
empty_post='[{"title": "Post with no comments", "content": "This post will have no comments"}]'
empty_post_response=$(auth_post "api/data/posts" "$empty_post")
empty_post_records=$(extract_data "$empty_post_response")
empty_post_id=$(echo "$empty_post_records" | jq -r '.[0].id')

empty_relationship_response=$(auth_get "api/data/posts/$empty_post_id/comments")
assert_success "$empty_relationship_response"

empty_relationship_data=$(extract_data "$empty_relationship_response")
empty_count=$(echo "$empty_relationship_data" | jq 'length')

if [[ "$empty_count" == "0" ]]; then
    print_success "Parent with no children correctly returns empty array"
else
    test_fail "Expected empty array, got $empty_count items"
fi

print_success "Describe API nested relationship tests completed successfully"

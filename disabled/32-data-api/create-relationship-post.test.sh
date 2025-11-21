#!/usr/bin/env bash
set -e

# Test: POST /api/data/:schema/:record/:relationship - Create nested related record
# Creates a child record with parent relationship automatically set

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing POST /api/data/:schema/:record/:relationship endpoint"

# Setup test environment with template and authentication (full)
setup_test_with_template "create-relationship-post"
setup_full_auth

# Create post schema with comments relationship
print_step "Creating post schema"
test_post_schema='{
  "title": "Posts",
  "type": "object",
  "properties": {
    "title": {"type": "string"},
    "content": {"type": "string"}
  }
}'

response=$(auth_post "api/describe/posts" "$test_post_schema")
extract_and_validate_data "$response" "Created post schema"

print_step "Creating comment schema with relationship"
test_comment_schema='{
  "title": "Comments",
  "type": "object",
  "properties": {
    "text": {"type": "string"},
    "post_id": {
      "type": "string",
      "x-monk-relationship": {
        "type": "owned",
        "schema": "posts",
        "name": "comments"
      }
    }
  }
}'

response=$(auth_post "api/describe/comments" "$test_comment_schema")
extract_and_validate_data "$response" "Created comment schema"

# Create a parent post
print_step "Creating parent post"
test_post_data='[{"title": "Test Post", "content": "This is a test post"}]'

response=$(auth_post "api/data/posts" "$test_post_data")
posts_array=$(extract_and_validate_data "$response" "Created post")
post_data=$(echo "$posts_array" | jq -r '.[0]')
post_id=$(echo "$post_data" | jq -r '.id')

if [[ -n "$post_id" && "$post_id" != "null" && "$post_id" != "" ]]; then
    print_success "Post created with ID: $post_id"
else
    test_fail "Expected post ID to be generated, got: $post_id"
fi

# Test: Create nested comment via relationship endpoint
print_step "Creating comment via nested endpoint"
test_comment_data='{"text": "This is a test comment"}'

response=$(auth_post "api/data/posts/$post_id/comments" "$test_comment_data")
comment_data=$(extract_and_validate_data "$response" "Created comment")
comment_id=$(echo "$comment_data" | jq -r '.id')

if [[ -n "$comment_id" && "$comment_id" != "null" && "$comment_id" != "" ]]; then
    print_success "Comment created with ID: $comment_id"
else
    test_fail "Expected comment ID to be generated, got: $comment_id"
fi

# Verify the comment has the correct text
comment_text=$(echo "$comment_data" | jq -r '.text')
if [[ "$comment_text" == "This is a test comment" ]]; then
    print_success "Comment contains correct text: $comment_text"
else
    test_fail "Expected text 'This is a test comment', got: $comment_text"
fi

# Verify the comment has the parent post ID
comment_post_id=$(echo "$comment_data" | jq -r '.post_id')
if [[ "$comment_post_id" == "$post_id" ]]; then
    print_success "Comment linked to parent post: $comment_post_id"
else
    test_fail "Expected post_id '$post_id', got: $comment_post_id"
fi

# Verify: Comment appears in relationship listing
print_step "Verifying comment appears in parent relationship"
response=$(auth_get "api/data/posts/$post_id/comments")
comments_array=$(extract_and_validate_data "$response" "Retrieved comments")
first_comment=$(echo "$comments_array" | jq -r '.[0]')
first_comment_id=$(echo "$first_comment" | jq -r '.id')

if [[ "$first_comment_id" == "$comment_id" ]]; then
    print_success "Comment found in parent relationship listing"
else
    test_fail "Expected comment ID '$comment_id' in listing, got: $first_comment_id"
fi

# Test: Get specific nested resource
print_step "Testing GET specific nested resource"
response=$(auth_get "api/data/posts/$post_id/comments/$comment_id")
specific_comment=$(extract_and_validate_data "$response" "Retrieved specific comment")
specific_comment_id=$(echo "$specific_comment" | jq -r '.id')
specific_comment_text=$(echo "$specific_comment" | jq -r '.text')
specific_comment_post_id=$(echo "$specific_comment" | jq -r '.post_id')

if [[ "$specific_comment_id" == "$comment_id" ]]; then
    print_success "Retrieved correct comment by ID: $specific_comment_id"
else
    test_fail "Expected comment ID '$comment_id', got: $specific_comment_id"
fi

if [[ "$specific_comment_text" == "This is a test comment" ]]; then
    print_success "Specific comment has correct text: $specific_comment_text"
else
    test_fail "Expected text 'This is a test comment', got: $specific_comment_text"
fi

if [[ "$specific_comment_post_id" == "$post_id" ]]; then
    print_success "Specific comment linked to correct parent: $specific_comment_post_id"
else
    test_fail "Expected post_id '$post_id', got: $specific_comment_post_id"
fi

# Test: Error cases
print_step "Testing error case: non-existent parent"
error_response=$(auth_post "api/data/posts/non-existent/comments" "$test_comment_data" || echo "Expected error")
if echo "$error_response" | grep -q "404\|NOT_FOUND"; then
    print_success "Correctly returned 404 for non-existent parent"
else
    test_fail "Expected 404 error for non-existent parent"
fi

print_step "Testing error case: non-existent relationship"
error_response=$(auth_post "api/data/posts/$post_id/invalid" "$test_comment_data" || echo "Expected error")
if echo "$error_response" | grep -q "404\|RELATIONSHIP_NOT_FOUND"; then
    print_success "Correctly returned 404 for non-existent relationship"
else
    test_fail "Expected 404 error for non-existent relationship"
fi

print_step "Testing error case: array body"
test_comment_array_data='[{"text": "Array comment"}]'
error_response=$(auth_post "api/data/posts/$post_id/comments" "$test_comment_array_data" || echo "Expected error")
if echo "$error_response" | grep -q "400\|INVALID_BODY_FORMAT"; then
    print_success "Correctly returned 400 for array body"
else
    test_fail "Expected 400 error for array body"
fi

print_step "Test completed successfully"

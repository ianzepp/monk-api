#!/usr/bin/env bash
set -e

# Test: PUT /api/data/:schema/:record/:relationship/:child - Update specific nested resource
# Updates a child record with parent relationship validation

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing PUT /api/data/:schema/:record/:relationship/:child endpoint"

# Setup test environment with template and admin authentication
setup_test_with_template "update-relationship-post"
setup_admin_auth

# Basic setup - create schemas
print_step "Setting up test schemas"
test_post_schema='{
  "title": "Posts",
  "type": "object",
  "properties": {
    "title": {"type": "string"},
    "content": {"type": "string"}
  }
}'

response=$(auth_post "api/meta/posts" "$test_post_schema")
extract_and_validate_data "$response" "Created post schema"

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

response=$(auth_post "api/meta/comments" "$test_comment_schema")
extract_and_validate_data "$response" "Created comment schema"

# Basic setup - create test data
print_step "Setting up test data"
test_post_data='[{"title": "Test Post", "content": "This is a test post"}]'
response=$(auth_post "api/data/posts" "$test_post_data")
posts_array=$(extract_and_validate_data "$response" "Created post")
post_id=$(echo "$posts_array" | jq -r '.[0].id')

test_comment_data='{"text": "Original comment text"}'
response=$(auth_post "api/data/posts/$post_id/comments" "$test_comment_data")
comment_data=$(extract_and_validate_data "$response" "Created comment")
comment_id=$(echo "$comment_data" | jq -r '.id')

print_success "Setup complete - Post ID: $post_id, Comment ID: $comment_id"

# Test: PUT specific nested resource
print_step "Testing PUT specific nested resource"
updated_comment_data='{"text": "This is an updated test comment"}'
response=$(auth_put "api/data/posts/$post_id/comments/$comment_id" "$updated_comment_data")
updated_comment=$(extract_and_validate_data "$response" "Updated specific comment")
updated_comment_id=$(echo "$updated_comment" | jq -r '.id')
updated_comment_text=$(echo "$updated_comment" | jq -r '.text')
updated_comment_post_id=$(echo "$updated_comment" | jq -r '.post_id')

if [[ "$updated_comment_id" == "$comment_id" ]]; then
    print_success "Updated comment has correct ID: $updated_comment_id"
else
    test_fail "Expected comment ID '$comment_id', got: $updated_comment_id"
fi

if [[ "$updated_comment_text" == "This is an updated test comment" ]]; then
    print_success "Comment text successfully updated: $updated_comment_text"
else
    test_fail "Expected text 'This is an updated test comment', got: $updated_comment_text"
fi

if [[ "$updated_comment_post_id" == "$post_id" ]]; then
    print_success "Updated comment still linked to correct parent: $updated_comment_post_id"
else
    test_fail "Expected post_id '$post_id', got: $updated_comment_post_id"
fi

# Verify update persisted by getting the comment again
print_step "Verifying update persisted"
response=$(auth_get "api/data/posts/$post_id/comments/$comment_id")
verified_comment=$(extract_and_validate_data "$response" "Verified updated comment")
verified_comment_text=$(echo "$verified_comment" | jq -r '.text')

if [[ "$verified_comment_text" == "This is an updated test comment" ]]; then
    print_success "Update persisted correctly: $verified_comment_text"
else
    test_fail "Expected text 'This is an updated test comment', got: $verified_comment_text"
fi

# Test: PUT error cases
print_step "Testing PUT error case: non-existent comment"
error_response=$(auth_put "api/data/posts/$post_id/comments/non-existent-id" "$updated_comment_data" || echo "Expected error")
if echo "$error_response" | grep -q "404\|NOT_FOUND"; then
    print_success "Correctly returned 404 for PUT of non-existent comment"
else
    test_fail "Expected 404 error for PUT of non-existent comment"
fi

# Create another post for cross-parent testing
other_post_data='[{"title": "Other Post", "content": "Another test post"}]'
other_response=$(auth_post "api/data/posts" "$other_post_data")
other_posts_array=$(extract_and_validate_data "$other_response" "Created other post")
other_post_id=$(echo "$other_posts_array" | jq -r '.[0].id')

print_step "Testing PUT error case: comment doesn't belong to parent"
error_response=$(auth_put "api/data/posts/$other_post_id/comments/$comment_id" "$updated_comment_data" || echo "Expected error")
if echo "$error_response" | grep -q "404\|NOT_FOUND"; then
    print_success "Correctly returned 404 for PUT of comment that doesn't belong to parent"
else
    test_fail "Expected 404 error for PUT of comment that doesn't belong to parent"
fi

print_step "Testing PUT error case: array body"
put_comment_array_data='[{"text": "Array update"}]'
error_response=$(auth_put "api/data/posts/$post_id/comments/$comment_id" "$put_comment_array_data" || echo "Expected error")
if echo "$error_response" | grep -q "400\|INVALID_BODY_FORMAT"; then
    print_success "Correctly returned 400 for PUT array body"
else
    test_fail "Expected 400 error for PUT array body"
fi

print_step "Test completed successfully"
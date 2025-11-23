#!/usr/bin/env bash
set -e

# Test: DELETE /api/data/:model/:record/:relationship/:child - Delete specific nested resource
# Deletes a child record with parent relationship validation

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing DELETE /api/data/:model/:record/:relationship/:child endpoint"

# Setup test environment with template and authentication (full)
setup_test_with_template "delete-relationship-post"
setup_full_auth

# Basic setup - create models
print_step "Setting up test models"
test_post_model='{
  "title": "Posts",
  "type": "object",
  "properties": {
    "title": {"type": "string"},
    "content": {"type": "string"}
  }
}'

response=$(auth_post "api/describe/posts" "$test_post_model")
extract_and_validate_data "$response" "Created post model"

test_comment_model='{
  "title": "Comments",
  "type": "object",
  "properties": {
    "text": {"type": "string"},
    "post_id": {
      "type": "string",
      "x-monk-relationship": {
        "type": "owned",
        "model": "posts",
        "name": "comments"
      }
    }
  }
}'

response=$(auth_post "api/describe/comments" "$test_comment_model")
extract_and_validate_data "$response" "Created comment model"

# Basic setup - create test data
print_step "Setting up test data"
test_post_data='[{"title": "Test Post", "content": "This is a test post"}]'
response=$(auth_post "api/data/posts" "$test_post_data")
posts_array=$(extract_and_validate_data "$response" "Created post")
post_id=$(echo "$posts_array" | jq -r '.[0].id')

test_comment_data='{"text": "Comment to be deleted"}'
response=$(auth_post "api/data/posts/$post_id/comments" "$test_comment_data")
comment_data=$(extract_and_validate_data "$response" "Created comment")
comment_id=$(echo "$comment_data" | jq -r '.id')

print_success "Setup complete - Post ID: $post_id, Comment ID: $comment_id"

# Test: DELETE specific nested resource
print_step "Testing DELETE specific nested resource"
response=$(auth_delete "api/data/posts/$post_id/comments/$comment_id")
delete_result=$(extract_and_validate_data "$response" "Deleted specific comment")
deleted_comment_id=$(echo "$delete_result" | jq -r '.id')

if [[ "$deleted_comment_id" == "$comment_id" ]]; then
    print_success "Successfully deleted comment: $deleted_comment_id"
else
    test_fail "Expected deleted comment ID '$comment_id', got: $deleted_comment_id"
fi

# Verify comment no longer exists
print_step "Verifying comment no longer exists"
error_response=$(auth_get "api/data/posts/$post_id/comments/$comment_id" || echo "Expected error")
if echo "$error_response" | grep -q "404\|NOT_FOUND"; then
    print_success "Correctly returned 404 for deleted comment"
else
    test_fail "Expected 404 error for deleted comment"
fi

# Verify comment no longer appears in relationship listing
print_step "Verifying comment no longer appears in parent relationship"
response=$(auth_get "api/data/posts/$post_id/comments")
comments_array=$(extract_and_validate_data "$response" "Retrieved comments after deletion")
comment_count=$(echo "$comments_array" | jq 'length')

if [[ "$comment_count" == "0" ]]; then
    print_success "Comment successfully removed from parent relationship listing"
else
    test_fail "Expected 0 comments in listing, got: $comment_count"
fi

# Test: DELETE error cases
print_step "Testing DELETE error case: non-existent comment"
error_response=$(auth_delete "api/data/posts/$post_id/comments/non-existent-id" || echo "Expected error")
if echo "$error_response" | grep -q "404\|NOT_FOUND"; then
    print_success "Correctly returned 404 for DELETE of non-existent comment"
else
    test_fail "Expected 404 error for DELETE of non-existent comment"
fi

# Create test data for cross-parent testing
other_post_data='[{"title": "Other Post", "content": "Another test post"}]'
other_response=$(auth_post "api/data/posts" "$other_post_data")
other_posts_array=$(extract_and_validate_data "$other_response" "Created other post")
other_post_id=$(echo "$other_posts_array" | jq -r '.[0].id')

# Create a new comment for testing cross-parent deletion error
new_comment_data='{"text": "Another test comment"}'
new_response=$(auth_post "api/data/posts/$post_id/comments" "$new_comment_data")
new_comment_data_result=$(extract_and_validate_data "$new_response" "Created new comment")
new_comment_id=$(echo "$new_comment_data_result" | jq -r '.id')

print_step "Testing DELETE error case: comment doesn't belong to parent"
error_response=$(auth_delete "api/data/posts/$other_post_id/comments/$new_comment_id" || echo "Expected error")
if echo "$error_response" | grep -q "404\|NOT_FOUND"; then
    print_success "Correctly returned 404 for DELETE of comment that doesn't belong to parent"
else
    test_fail "Expected 404 error for DELETE of comment that doesn't belong to parent"
fi

# Clean up the new comment properly
response=$(auth_delete "api/data/posts/$post_id/comments/$new_comment_id")
extract_and_validate_data "$response" "Cleaned up new comment"

print_step "Test completed successfully"

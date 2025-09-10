#!/usr/bin/env bash
set -e

# Test: DELETE /api/data/:schema/:record/:relationship - Delete all related records
# Deletes all child records belonging to the parent relationship

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing DELETE /api/data/:schema/:record/:relationship endpoint"

# Setup test environment with template and admin authentication
setup_test_with_template "delete-relationship-array"
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

response=$(auth_post "api/describe/posts" "$test_post_schema")
extract_and_validate_data "$response" "Created post schema"

test_comment_schema='{
  "title": "Comments",
  "type": "object",
  "properties": {
    "text": {"type": "string"},
    "status": {"type": "string"},
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

# Basic setup - create test data
print_step "Setting up test data"
test_post_data='[{"title": "Test Post", "content": "This is a test post"}]'
response=$(auth_post "api/data/posts" "$test_post_data")
posts_array=$(extract_and_validate_data "$response" "Created post")
post_id=$(echo "$posts_array" | jq -r '.[0].id')

# Create multiple comments
comment1_data='{"text": "First comment", "status": "published"}'
response=$(auth_post "api/data/posts/$post_id/comments" "$comment1_data")
comment1=$(extract_and_validate_data "$response" "Created comment 1")
comment1_id=$(echo "$comment1" | jq -r '.id')

comment2_data='{"text": "Second comment", "status": "draft"}'
response=$(auth_post "api/data/posts/$post_id/comments" "$comment2_data")
comment2=$(extract_and_validate_data "$response" "Created comment 2")
comment2_id=$(echo "$comment2" | jq -r '.id')

comment3_data='{"text": "Third comment", "status": "published"}'
response=$(auth_post "api/data/posts/$post_id/comments" "$comment3_data")
comment3=$(extract_and_validate_data "$response" "Created comment 3")
comment3_id=$(echo "$comment3" | jq -r '.id')

print_success "Setup complete - Post ID: $post_id with 3 comments"

# Verify initial state
response=$(auth_get "api/data/posts/$post_id/comments")
initial_comments=$(extract_and_validate_data "$response" "Initial comments")
initial_count=$(echo "$initial_comments" | jq 'length')

if [[ "$initial_count" == "3" ]]; then
    print_success "Initial state verified: 3 comments exist"
else
    test_fail "Expected 3 comments initially, got: $initial_count"
fi

# Test: DELETE all comments for the post
print_step "Testing DELETE all comments"
response=$(auth_delete "api/data/posts/$post_id/comments")
delete_result=$(extract_and_validate_data "$response" "Deleted all comments")
deleted_count=$(echo "$delete_result" | jq 'length')

if [[ "$deleted_count" == "3" ]]; then
    print_success "Successfully deleted all 3 comments"
else
    test_fail "Expected to delete 3 comments, got: $deleted_count"
fi

# Verify all comments deleted
response=$(auth_get "api/data/posts/$post_id/comments")
final_comments=$(extract_and_validate_data "$response" "Final comments check")
final_count=$(echo "$final_comments" | jq 'length')

if [[ "$final_count" == "0" ]]; then
    print_success "All comments successfully removed from relationship"
else
    test_fail "Expected 0 remaining comments, got: $final_count"
fi

# Test: DELETE on empty relationship (should return empty array)
print_step "Testing DELETE on empty relationship"
response=$(auth_delete "api/data/posts/$post_id/comments")
empty_result=$(extract_and_validate_data "$response" "Delete from empty relationship")
empty_count=$(echo "$empty_result" | jq 'length')

if [[ "$empty_count" == "0" ]]; then
    print_success "DELETE on empty relationship returned empty array"
else
    test_fail "Expected 0 results for empty relationship delete, got: $empty_count"
fi

# Test cross-parent isolation - create another post with comments
print_step "Testing cross-parent isolation"
other_post_data='[{"title": "Other Post", "content": "Another test post"}]'
other_response=$(auth_post "api/data/posts" "$other_post_data")
other_posts_array=$(extract_and_validate_data "$other_response" "Created other post")
other_post_id=$(echo "$other_posts_array" | jq -r '.[0].id')

# Add comments to the other post
other_comment_data='{"text": "Other comment", "status": "published"}'
response=$(auth_post "api/data/posts/$other_post_id/comments" "$other_comment_data")
other_comment=$(extract_and_validate_data "$response" "Created other comment")
other_comment_id=$(echo "$other_comment" | jq -r '.id')

# Verify other post has 1 comment
response=$(auth_get "api/data/posts/$other_post_id/comments")
other_comments=$(extract_and_validate_data "$response" "Other post comments")
other_count=$(echo "$other_comments" | jq 'length')

if [[ "$other_count" == "1" ]]; then
    print_success "Other post has 1 comment as expected"
else
    test_fail "Expected other post to have 1 comment, got: $other_count"
fi

# Delete comments from first post should not affect other post
response=$(auth_delete "api/data/posts/$post_id/comments")
first_delete_result=$(extract_and_validate_data "$response" "Delete from first post")
first_delete_count=$(echo "$first_delete_result" | jq 'length')

if [[ "$first_delete_count" == "0" ]]; then
    print_success "DELETE on empty first post returned empty array"
else
    test_fail "Expected 0 results for empty first post delete, got: $first_delete_count"
fi

# Verify other post still has its comment
response=$(auth_get "api/data/posts/$other_post_id/comments")
other_comments_after=$(extract_and_validate_data "$response" "Other post comments after first post delete")
other_count_after=$(echo "$other_comments_after" | jq 'length')

if [[ "$other_count_after" == "1" ]]; then
    print_success "Other post comment unaffected by first post delete"
else
    test_fail "Expected other post to still have 1 comment, got: $other_count_after"
fi

# Test: Error cases
print_step "Testing error case: non-existent parent"
error_response=$(auth_delete "api/data/posts/non-existent/comments" || echo "Expected error")
if echo "$error_response" | grep -q "404\|NOT_FOUND"; then
    print_success "Correctly returned 404 for non-existent parent"
else
    test_fail "Expected 404 error for non-existent parent"
fi

print_step "Testing error case: non-existent relationship"
error_response=$(auth_delete "api/data/posts/$post_id/invalid" || echo "Expected error")
if echo "$error_response" | grep -q "404\|RELATIONSHIP_NOT_FOUND"; then
    print_success "Correctly returned 404 for non-existent relationship"
else
    test_fail "Expected 404 error for non-existent relationship"
fi

print_step "Test completed successfully"

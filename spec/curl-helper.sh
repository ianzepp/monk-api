#!/usr/bin/env bash
#
# Curl Helper Library for Monk API Testing
# 
# Provides streamlined functions for testing HTTP endpoints with clean syntax,
# authentication handling, and response validation.
#

# Configuration
export API_BASE="${API_BASE:-http://localhost:9001}"
export JWT_TOKEN="${JWT_TOKEN:-}"
export ROOT_TOKEN="${ROOT_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Output formatting functions
print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

test_fail() {
    print_error "$1"
    exit 1
}

# ===========================
# Core HTTP Functions
# ===========================

# Basic HTTP requests (no authentication)
api_get() {
    local endpoint="$1"
    shift
    curl -s "$API_BASE/$endpoint" "$@"
}

api_post() {
    local endpoint="$1"
    local data="$2"
    shift 2
    curl -s -X POST "$API_BASE/$endpoint" \
        -H "Content-Type: application/json" \
        -d "$data" "$@"
}

api_put() {
    local endpoint="$1"
    local data="$2" 
    shift 2
    curl -s -X PUT "$API_BASE/$endpoint" \
        -H "Content-Type: application/json" \
        -d "$data" "$@"
}

api_delete() {
    local endpoint="$1"
    shift
    curl -s -X DELETE "$API_BASE/$endpoint" "$@"
}

# HTTP requests with status code capture
api_get_with_status() {
    local endpoint="$1"
    shift
    curl -s -w "HTTP_STATUS:%{http_code}" "$API_BASE/$endpoint" "$@"
}

api_post_with_status() {
    local endpoint="$1"
    local data="$2"
    shift 2
    curl -s -w "HTTP_STATUS:%{http_code}" -X POST "$API_BASE/$endpoint" \
        -H "Content-Type: application/json" \
        -d "$data" "$@"
}

# ===========================
# Authenticated HTTP Functions
# ===========================

# Authenticated requests (user JWT)
auth_get() {
    local endpoint="$1"
    shift
    api_get "$endpoint" -H "Authorization: Bearer $JWT_TOKEN" "$@"
}

auth_post() {
    local endpoint="$1"
    local data="$2"
    shift 2
    api_post "$endpoint" "$data" -H "Authorization: Bearer $JWT_TOKEN" "$@"
}

auth_put() {
    local endpoint="$1"
    local data="$2"
    shift 2
    api_put "$endpoint" "$data" -H "Authorization: Bearer $JWT_TOKEN" "$@"
}

auth_delete() {
    local endpoint="$1"
    shift
    api_delete "$endpoint" -H "Authorization: Bearer $JWT_TOKEN" "$@"
}

# Root operations (elevated JWT)
root_get() {
    local endpoint="$1"
    shift
    api_get "$endpoint" -H "Authorization: Bearer $ROOT_TOKEN" "$@"
}

root_post() {
    local endpoint="$1"
    local data="$2"
    shift 2
    api_post "$endpoint" "$data" -H "Authorization: Bearer $ROOT_TOKEN" "$@"
}

root_delete() {
    local endpoint="$1"
    shift
    api_delete "$endpoint" -H "Authorization: Bearer $ROOT_TOKEN" "$@"
}

# ===========================
# Authentication Helpers
# ===========================

# Login and token management
login_user() {
    local tenant="$1"
    local username="$2"
    
    # Use jq to properly escape JSON to avoid control character issues
    local json_data=$(jq -n --arg tenant "$tenant" --arg username "$username" \
        '{tenant: $tenant, username: $username}')
    
    api_post "auth/login" "$json_data"
}

get_user_token() {
    local tenant="$1"
    local username="$2"
    local response=$(login_user "$tenant" "$username")
    
    if echo "$response" | jq -e '.success == true' >/dev/null; then
        echo "$response" | jq -r '.data.token'
    else
        test_fail "Failed to get user token: $response"
    fi
}

escalate_sudo() {
    local reason="${1:-Testing operations}"
    
    # Use jq to properly escape JSON
    local json_data=$(jq -n --arg reason "$reason" '{reason: $reason}')
    local response=$(auth_post "api/auth/sudo" "$json_data")
    
    if echo "$response" | jq -e '.success == true' >/dev/null; then
        echo "$response" | jq -r '.data.root_token'
    else
        test_fail "Failed to escalate sudo: $response"
    fi
}

# Test authentication setup with isolated tenant
setup_test_auth() {
    local tenant="${1:-$TEST_TENANT_NAME}"
    local username="${2:-root}"
    
    # Ensure we have a test tenant
    if [[ -z "$tenant" || -z "$TEST_TENANT_NAME" ]]; then
        print_warning "No test tenant available - creating isolated tenant"
        source "$(dirname "${BASH_SOURCE[0]}")/helpers/test-tenant-helper.sh"
        setup_isolated_test "auth_test"
        tenant="$TEST_TENANT_NAME"
    fi
    
    print_step "Setting up authentication for $username@$tenant"
    JWT_TOKEN=$(get_user_token "$tenant" "$username")
    export JWT_TOKEN
    
    if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
        print_success "User authentication configured"
    else
        test_fail "Failed to setup user authentication"
    fi
}

setup_root_auth() {
    local reason="${1:-Administrative testing}"
    
    if [[ -z "$JWT_TOKEN" ]]; then
        setup_test_auth
    fi
    
    print_step "Escalating to root privileges"
    ROOT_TOKEN=$(escalate_sudo "$reason")
    export ROOT_TOKEN
    
    if [[ -n "$ROOT_TOKEN" && "$ROOT_TOKEN" != "null" ]]; then
        print_success "Root authentication configured"
    else
        test_fail "Failed to setup root authentication"
    fi
}

# ===========================
# Response Validation
# ===========================

# JSON response validation
assert_success() {
    local response="$1"
    echo "$response" | jq -e '.success == true' >/dev/null || \
        test_fail "Expected success response: $response"
}

assert_error() {
    local response="$1"
    echo "$response" | jq -e '.success == false' >/dev/null || \
        test_fail "Expected error response: $response"
}

assert_error_code() {
    local expected_code="$1"
    local response="$2"
    local actual_code=$(echo "$response" | jq -r '.error_code // empty')
    
    if [[ "$actual_code" != "$expected_code" ]]; then
        test_fail "Expected error code '$expected_code', got '$actual_code': $response"
    fi
}

assert_has_field() {
    local field="$1"
    local response="$2"
    echo "$response" | jq -e ".$field != null" >/dev/null || \
        test_fail "Expected field '$field' in response: $response"
}

# HTTP status validation
check_http_status() {
    local expected_status="$1"
    local endpoint="$2"
    shift 2
    local actual_status=$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/$endpoint" "$@")
    
    if [[ "$actual_status" != "$expected_status" ]]; then
        test_fail "Expected HTTP $expected_status, got $actual_status for $endpoint"
    fi
}

assert_http_401() {
    local endpoint="$1"
    shift
    check_http_status "401" "$endpoint" "$@"
}

assert_http_403() {
    local endpoint="$1" 
    shift
    check_http_status "403" "$endpoint" "$@"
}

assert_http_404() {
    local endpoint="$1"
    shift
    check_http_status "404" "$endpoint" "$@"
}

# ===========================
# Test Data Helpers
# ===========================

# Generate test data
generate_test_schema() {
    local schema_name="$1"
    cat <<EOF
{
  "title": "$schema_name",
  "properties": {
    "name": {"type": "string", "minLength": 1},
    "email": {"type": "string", "format": "email"},
    "active": {"type": "boolean", "default": true}
  },
  "required": ["name", "email"]
}
EOF
}

generate_test_record() {
    local name="$1"
    local email="$2"
    cat <<EOF
{
  "name": "$name",
  "email": "$email",
  "active": true
}
EOF
}

# ===========================
# Utility Functions
# ===========================

# Wait for server to be ready
wait_for_server() {
    local max_attempts=30
    local attempt=0
    
    print_step "Waiting for server to be ready..."
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -s "$API_BASE/" >/dev/null 2>&1; then
            print_success "Server is ready"
            return 0
        fi
        
        sleep 1
        ((attempt++))
    done
    
    test_fail "Server did not become ready after $max_attempts seconds"
}

# Clean up test data (if needed)
cleanup_test_data() {
    print_step "Cleaning up test data (if authenticated)"
    
    if [[ -n "$JWT_TOKEN" ]]; then
        # Future: Add cleanup operations
        print_success "Test cleanup completed"
    else
        print_warning "No authentication - skipping cleanup"
    fi
}

# Source this file in test scripts:
# source "$(dirname "$0")/../curl-helper.sh"
#!/usr/bin/env bash
#
# Main Test Helper Library
# Provides high-level test setup and validation functions to reduce duplication
#

# Source all required helpers
source "$(dirname "${BASH_SOURCE[0]}")/curl-helper.sh"
source "$(dirname "${BASH_SOURCE[0]}")/test-tenant-helper.sh"

# ===========================
# Test Setup Functions
# ===========================

# Complete test setup with template (most common pattern)
setup_test_with_template() {
    local test_name="${1:-tests}"
    local template="${2:-testing}"

    wait_for_server
    print_step "Creating test tenant from fixtures template"
    local tenant_name=$(create_test_tenant_from_template "$test_name" "$template")
    load_test_env

    if [[ -z "$tenant_name" ]]; then
        test_fail "Template cloning failed - fixtures template required for this test"
    fi

    # Setup automatic cleanup for transient tenant database
    setup_test_cleanup_trap "$tenant_name" "$TEST_DATABASE_NAME"

    print_success "Test tenant cloned from template"
    echo "$tenant_name"
}

# Complete test setup with isolated tenant (fallback pattern)
setup_test_isolated() {
    local test_name="$1"

    wait_for_server
    setup_isolated_test "$test_name"
    print_success "Isolated test environment ready"
}

# Simple API test setup (no tenant isolation needed)
setup_test_default() {
    wait_for_server
}

# ===========================
# Authentication Setup Functions
# ===========================

# Setup authentication (full) for current tenant
setup_full_auth() {
    print_step "Setting up authentication for full user"
    JWT_TOKEN=$(get_user_token "$TEST_TENANT_NAME" "full")

    if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
        print_success "authentication (full) configured"
        export JWT_TOKEN
    else
        test_fail "Failed to authenticate full user"
    fi
}

# Setup root authentication for current tenant
setup_root_auth() {
    print_step "Setting up authentication for root user"
    JWT_TOKEN=$(get_user_token "$TEST_TENANT_NAME" "root")

    if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
        print_success "Root authentication configured"
        export JWT_TOKEN
    else
        test_fail "Failed to authenticate root user"
    fi
}

# ===========================
# Data Validation Helper Functions
# ===========================

# Extract and validate data field exists
extract_and_validate_data() {
    local response="$1"
    local description="${2:-data}"

    assert_success "$response"
    assert_has_field "data" "$response"

    local data=$(extract_data "$response")
    if [[ "$data" == "null" ]]; then
        test_fail "$description is null in response"
    fi

    echo "$data"
}

# Validate record has expected fields
validate_record_fields() {
    local record="$1"
    shift
    local fields=("$@")

    for field in "${fields[@]}"; do
        if echo "$record" | jq -e ".$field != null" >/dev/null; then
            print_success "Record contains expected '$field' field"
        else
            test_fail "Record missing expected '$field' field"
        fi
    done
}

# Validate system timestamps are present
validate_system_timestamps() {
    local record="$1"

    local created_at=$(echo "$record" | jq -r '.created_at')
    if [[ -n "$created_at" && "$created_at" != "null" ]]; then
        print_success "Record has created_at timestamp: $created_at"
    else
        test_fail "Expected created_at timestamp to be set"
    fi

    local updated_at=$(echo "$record" | jq -r '.updated_at')
    if [[ -n "$updated_at" && "$updated_at" != "null" ]]; then
        print_success "Record has updated_at timestamp: $updated_at"
    else
        test_fail "Expected updated_at timestamp to be set"
    fi
}

# ===========================
# Error Testing Helper Functions
# ===========================

# Test that an endpoint returns expected error
test_endpoint_error() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_code="$4"
    local description="$5"

    print_step "Testing $method $endpoint ($description)"

    local response
    case "$method" in
        "GET") response=$(auth_get "$endpoint" || echo '{"success":false}') ;;
        "POST") response=$(auth_post "$endpoint" "$data" || echo '{"success":false}') ;;
        "PUT") response=$(auth_put "$endpoint" "$data" || echo '{"success":false}') ;;
        "DELETE") response=$(auth_delete "$endpoint" || echo '{"success":false}') ;;
    esac

    assert_error "$response"
    if [[ -n "$expected_code" ]]; then
        assert_error_code "$expected_code" "$response"
    fi

    print_success "$description properly returns error"
}

# Test non-existent record operations (common pattern)
test_nonexistent_record() {
    local schema="$1"
    local operation="$2"
    local data="${3:-{}}"

    local fake_id="00000000-0000-0000-0000-000000000000"
    local endpoint="api/data/$schema/$fake_id"

    case "$operation" in
        "get") test_endpoint_error "GET" "$endpoint" "" "" "Non-existent record retrieval" ;;
        "update") test_endpoint_error "PUT" "$endpoint" "$data" "" "Non-existent record update" ;;
        "delete") test_endpoint_error "DELETE" "$endpoint" "" "" "Non-existent record deletion" ;;
    esac
}

# Test non-existent schema operations (common pattern)
test_nonexistent_schema() {
    local operation="$1"
    local data="${2:-{}}"

    local endpoint="api/describe/nonexistent"

    case "$operation" in
        "get") test_endpoint_error "GET" "$endpoint" "" "SCHEMA_NOT_FOUND" "Non-existent schema retrieval" ;;
        "update") test_endpoint_error "PUT" "$endpoint" "$data" "SCHEMA_NOT_FOUND" "Non-existent schema update" ;;
        "delete") test_endpoint_error "DELETE" "$endpoint" "" "SCHEMA_NOT_FOUND" "Non-existent schema deletion" ;;
    esac
}

# ===========================
# Test Data Generation Functions
# ===========================

# Generate test account data
generate_test_account() {
    local name="${1:-Test User}"
    local email="${2:-testuser@example.com}"
    local username="${3:-testuser}"

    cat <<EOF
[{
    "name": "$name",
    "email": "$email",
    "username": "$username",
    "account_type": "personal",
    "balance": 100.50,
    "is_active": true,
    "is_verified": false
}]
EOF
}

# Generate simple schema for testing
generate_simple_schema() {
    local title="$1"
    local required_fields="$2"

    cat <<EOF
{
    "title": "$title",
    "type": "object",
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "description": {"type": "string"}
    },
    "required": [$required_fields],
    "additionalProperties": false
}
EOF
}

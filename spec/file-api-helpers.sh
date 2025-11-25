#!/usr/bin/env bash
#
# File API Test Helper Library
#
# Provides streamlined functions for testing File API endpoints with clean syntax,
# response extraction, and File-specific validation patterns.
#

# Source core helpers
source "$(dirname "${BASH_SOURCE[0]}")/curl-helper.sh"

# ===========================
# File API Request Functions
# ===========================

# File API POST requests with automatic data extraction
file_api_post() {
    local endpoint="$1"
    local data="$2"
    shift 2

    local response=$(auth_post "api/file/$endpoint" "$data" "$@")
    assert_success "$response"

    # Extract data field when present, fallback to full response for path-first API
    local extracted=$(extract_data "$response")
    if [[ "$extracted" == "null" ]]; then
        echo "$response"
    else
        echo "$extracted"
    fi
}

# Specific File API endpoint helpers
file_list() {
    local path="$1"
    local options="${2:-{}}"

    local request_data=$(jq -n --arg path "$path" --argjson options "$options" \
        '{path: $path, file_options: $options}')

    file_api_post "list" "$request_data"
}

file_stat() {
    local path="$1"

    local request_data=$(jq -n --arg path "$path" '{path: $path}')
    file_api_post "stat" "$request_data"
}

file_retrieve() {
    local path="$1"
    local options="${2:-{}}"

    local request_data=$(jq -n --arg path "$path" --argjson options "$options" \
        '{path: $path, file_options: $options}')

    file_api_post "retrieve" "$request_data"
}

file_store() {
    local path="$1"
    local content="$2"
    local options="${3:-{}}"

    local request_data=$(jq -n --arg path "$path" --argjson content "$content" --argjson options "$options" \
        '{path: $path, content: $content, file_options: $options}')

    file_api_post "store" "$request_data"
}

file_delete() {
    local path="$1"
    local options="${2:-{}}"
    local safety_checks="${3:-{}}"

    local request_data=$(jq -n --arg path "$path" --argjson options "$options" --argjson safety "$safety_checks" \
        '{path: $path, file_options: $options, safety_checks: $safety}')

    file_api_post "delete" "$request_data"
}

file_size() {
    local path="$1"

    local request_data=$(jq -n --arg path "$path" '{path: $path}')
    file_api_post "size" "$request_data"
}

file_modify_time() {
    local path="$1"

    local request_data=$(jq -n --arg path "$path" '{path: $path}')
    file_api_post "modify-time" "$request_data"
}

# ===========================
# File API Error Testing
# ===========================

# Test File API endpoint for expected error
test_file_api_error() {
    local endpoint="$1"
    local path="$2"
    local expected_error_code="$3"
    local description="$4"

    print_step "Testing File API error: $description"

    local request_data=$(jq -n --arg path "$path" '{path: $path}')
    local response=$(auth_post "api/file/$endpoint" "$request_data" || echo '{"success":false}')

    assert_error "$response"

    if [[ -n "$expected_error_code" ]]; then
        local actual_code=$(echo "$response" | jq -r '.error_code // .error // empty')
        if [[ "$actual_code" == "$expected_error_code" ]]; then
            print_success "$description - error code: $actual_code"
        else
            test_fail "$description - expected error code $expected_error_code, got: $actual_code"
        fi
    else
        print_success "$description properly returns error"
    fi
}

# ===========================
# File API Validation Helpers
# ===========================

# Validate File metadata structure
validate_file_metadata() {
    local file_stat="$1"
    local expected_type="$2"
    local description="$3"

    # Validate required fields exist
    assert_has_field "file_metadata" "$file_stat"
    assert_has_field "record_info" "$file_stat"

    # Validate file type
    local actual_type=$(echo "$file_stat" | jq -r '.file_metadata.type')
    if [[ "$actual_type" == "$expected_type" ]]; then
        print_success "$description type: $actual_type"
    else
        test_fail "$description should be $expected_type, got: $actual_type"
    fi

    # Validate permissions format
    local permissions=$(echo "$file_stat" | jq -r '.file_metadata.permissions')
    if [[ "$permissions" =~ ^[r-][w-][x-]$ ]]; then
        print_success "$description permissions: $permissions"
    else
        test_fail "$description permissions invalid format: $permissions"
    fi

    # Validate timestamp format
    local modified_time=$(echo "$file_stat" | jq -r '.file_metadata.modified_time')
    if [[ "$modified_time" =~ ^[0-9]{14}$ ]]; then
        print_success "$description timestamp: $modified_time"
    else
        test_fail "$description timestamp invalid format: $modified_time"
    fi
}

# Validate record info structure
validate_record_info() {
    local file_stat="$1"
    local expected_model="$2"
    local expected_record_id="$3"
    local description="$4"

    local model=$(echo "$file_stat" | jq -r '.record_info.model')
    if [[ "$model" == "$expected_model" ]]; then
        print_success "$description model: $model"
    else
        test_fail "$description model should be '$expected_model', got: $model"
    fi

    if [[ -n "$expected_record_id" ]]; then
        local record_id=$(echo "$file_stat" | jq -r '.record_info.record_id')
        if [[ "$record_id" == "$expected_record_id" ]]; then
            print_success "$description record_id: $record_id"
        else
            test_fail "$description record_id should be '$expected_record_id', got: $record_id"
        fi
    fi
}

# Validate field info structure
validate_field_info() {
    local file_stat="$1"
    local expected_field_name="$2"
    local description="$3"

    local field_name=$(echo "$file_stat" | jq -r '.record_info.field_name')
    if [[ "$field_name" == "$expected_field_name" ]]; then
        print_success "$description field_name: $field_name"
    else
        test_fail "$description field_name should be '$expected_field_name', got: $field_name"
    fi
}

# Validate file size makes sense
validate_file_size() {
    local file_stat="$1"
    local min_size="$2"
    local description="$3"

    local size=$(echo "$file_stat" | jq -r '.file_metadata.size')
    if [[ "$size" -ge "$min_size" ]]; then
        print_success "$description size: $size bytes (>= $min_size)"
    else
        test_fail "$description size should be >= $min_size, got: $size"
    fi
}

# ===========================
# File API Path Testing Helpers
# ===========================

# Test complete path hierarchy for a record
test_record_hierarchy() {
    local model="$1"
    local record_id="$2"
    local record_name="$3"

    print_step "Testing complete File API hierarchy for: $model/$record_id"

    # Model directory
    local model_stat=$(file_stat "/data/$model")
    validate_file_metadata "$model_stat" "directory" "Model directory"
    validate_record_info "$model_stat" "$model" "" "Model directory"

    # Record directory
    local record_dir_stat=$(file_stat "/data/$model/$record_id")
    validate_file_metadata "$record_dir_stat" "directory" "Record directory"
    validate_record_info "$record_dir_stat" "$model" "$record_id" "Record directory"

    # Record JSON file
    local record_file_stat=$(file_stat "/data/$model/$record_id.json")
    validate_file_metadata "$record_file_stat" "file" "Record JSON file"
    validate_record_info "$record_file_stat" "$model" "$record_id" "Record JSON file"
    validate_file_size "$record_file_stat" "10" "Record JSON file"

    print_success "Complete hierarchy validated for: $record_name"
}

# Test field access for a record
test_field_access() {
    local model="$1"
    local record_id="$2"
    local field_name="$3"
    local expected_content="$4"

    print_step "Testing field access: $model/$record_id/$field_name"

    # Field file stat
    local field_stat=$(file_stat "/data/$model/$record_id/$field_name")
    validate_file_metadata "$field_stat" "file" "Field file"
    validate_record_info "$field_stat" "$model" "$record_id" "Field file"
    validate_field_info "$field_stat" "$field_name" "Field file"

    # Validate field size makes sense for content
    if [[ -n "$expected_content" ]]; then
        local expected_min_size=${#expected_content}
        validate_file_size "$field_stat" "$expected_min_size" "Field file"
    fi

    print_success "Field access validated: $field_name"
}

# ===========================
# Template Data Helpers
# ===========================

# Get first account from template for testing
get_template_account() {
    local accounts_response=$(auth_get "api/data/account")
    local accounts_data=$(extract_and_validate_data "$accounts_response" "accounts")

    local account_count=$(echo "$accounts_data" | jq 'length')
    if [[ "$account_count" -lt 1 ]]; then
        test_fail "No accounts found in template"
    fi

    # Return first account as JSON
    echo "$accounts_data" | jq '.[0]'
}

# Extract account info for testing
extract_account_info() {
    local account="$1"

    # Export as global variables for easy access in tests
    ACCOUNT_ID=$(echo "$account" | jq -r '.id')
    ACCOUNT_NAME=$(echo "$account" | jq -r '.name')
    ACCOUNT_EMAIL=$(echo "$account" | jq -r '.email')

    export ACCOUNT_ID ACCOUNT_NAME ACCOUNT_EMAIL

    print_success "Account info: $ACCOUNT_NAME ($ACCOUNT_ID) - $ACCOUNT_EMAIL"
}

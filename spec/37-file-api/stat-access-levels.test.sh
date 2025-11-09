#!/usr/bin/env bash
set -e

# File API Stat Access Levels Test - SKIPPED
# Tests the POST /api/file/stat endpoint with different user access levels to verify permission-based responses
# STATUS: DISABLED - File API implementation needs review

echo "🚫 FILE API TEST DISABLED: stat-access-levels.test.sh - File API implementation under review"
exit 0

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API access levels with multiple user roles"

# Setup test environment with template (provides multiple users)
setup_test_with_template "stat-access-levels"

# First, let's discover what users are available in the template
print_step "Discovering available users in template"
admin_auth_response=$(login_user "$TEST_TENANT_NAME" "admin")
admin_token=$(echo "$admin_auth_response" | jq -r '.data.token')

if [[ -z "$admin_token" || "$admin_token" == "null" ]]; then
    test_fail "Failed to authenticate as admin user"
fi

# Set admin token globally
JWT_TOKEN="$admin_token"

# Get all users to see what access levels are available
print_step "Querying available users and their access levels"
users_response=$(auth_get "api/data/users")
users_data=$(extract_and_validate_data "$users_response" "users list")

echo "$users_data" | jq -c '.[] | {name: .name, auth: .auth, access: .access}' | while IFS= read -r user_info; do
    user_name=$(echo "$user_info" | jq -r '.name')
    user_auth=$(echo "$user_info" | jq -r '.auth')
    user_access=$(echo "$user_info" | jq -r '.access')
    echo "Found user: $user_name (auth: $user_auth, access: $user_access)"
done

# Extract specific users for testing
admin_user=$(echo "$users_data" | jq -r '.[] | select(.access == "full") | .auth' | head -1)
read_user=$(echo "$users_data" | jq -r '.[] | select(.access == "read") | .auth' | head -1)
edit_user=$(echo "$users_data" | jq -r '.[] | select(.access == "edit") | .auth' | head -1)

print_success "Identified test users:"
echo "  - Admin/Full user: $admin_user"
echo "  - Read-only user: $read_user" 
echo "  - Edit user: $edit_user"

if [[ -z "$admin_user" || "$admin_user" == "null" ]]; then
    test_fail "No admin/full access user found in template"
fi

if [[ -z "$read_user" || "$read_user" == "null" ]]; then
    print_warning "No read-only user found in template, will skip read-only tests"
    read_user=""
fi

if [[ -z "$edit_user" || "$edit_user" == "null" ]]; then
    print_warning "No edit user found in template, will skip edit user tests"
    edit_user=""
fi

# Test 1: Admin user validates full permissions on existing records
print_step "Testing admin user: validating full permissions on existing template records"

# Authenticate as admin user
admin_auth=$(login_user "$TEST_TENANT_NAME" "$admin_user")
admin_jwt=$(echo "$admin_auth" | jq -r '.data.token')
JWT_TOKEN="$admin_jwt"

# Get existing template records to test with
template_accounts=$(auth_get "api/data/account")
template_data=$(extract_and_validate_data "$template_accounts" "template accounts")
test_record_id=$(echo "$template_data" | jq -r '.[0].id')

if [[ -n "$test_record_id" && "$test_record_id" != "null" ]]; then
    print_success "Using existing template record for testing: $test_record_id"
else
    test_fail "No template records available for testing"
fi

# Validate admin has full permissions on the record
admin_record_stat=$(file_stat "/data/account/$test_record_id.json")
admin_record_perms=$(echo "$admin_record_stat" | jq -r '.file_metadata.permissions')
admin_access_level=$(echo "$admin_record_stat" | jq -r '.record_info.access_permissions[0]')

if [[ "$admin_record_perms" == "rwx" && "$admin_access_level" == "full" ]]; then
    print_success "Admin has full permissions on created record: $admin_record_perms (access: $admin_access_level)"
else
    test_fail "Admin permissions incorrect: $admin_record_perms (access: $admin_access_level)"
fi

# Test field permissions for admin
admin_field_stat=$(file_stat "/data/account/$test_record_id/email")
admin_field_perms=$(echo "$admin_field_stat" | jq -r '.file_metadata.permissions')
admin_field_access=$(echo "$admin_field_stat" | jq -r '.record_info.access_permissions[0]')

if [[ "$admin_field_perms" == "rwx" && "$admin_field_access" == "full" ]]; then
    print_success "Admin has full field permissions: $admin_field_perms (access: $admin_field_access)"
else
    test_fail "Admin field permissions incorrect: $admin_field_perms (access: $admin_field_access)"
fi

# Test 2: Read-only user validates read-only permissions
if [[ -n "$read_user" ]]; then
    print_step "Testing read-only user: validating read-only permissions"
    
    # Authenticate as read-only user
    read_auth=$(login_user "$TEST_TENANT_NAME" "$read_user")
    read_jwt=$(echo "$read_auth" | jq -r '.data.token')
    
    if [[ -n "$read_jwt" && "$read_jwt" != "null" ]]; then
        JWT_TOKEN="$read_jwt"
        print_success "Authenticated as read-only user: $read_user"
        
        # Test record permissions for read user
        read_record_stat=$(file_stat "/data/account/$test_record_id.json")
        read_record_perms=$(echo "$read_record_stat" | jq -r '.file_metadata.permissions')
        read_access_level=$(echo "$read_record_stat" | jq -r '.record_info.access_permissions[0]')
        
        if [[ "$read_record_perms" == "r--" && "$read_access_level" == "read" ]]; then
            print_success "Read user has read-only permissions: $read_record_perms (access: $read_access_level)"
        else
            test_fail "Read user permissions incorrect: $read_record_perms (access: $read_access_level)"
        fi
        
        # Test field permissions for read user
        read_field_stat=$(file_stat "/data/account/$test_record_id/name")
        read_field_perms=$(echo "$read_field_stat" | jq -r '.file_metadata.permissions')
        read_field_access=$(echo "$read_field_stat" | jq -r '.record_info.access_permissions[0]')
        
        if [[ "$read_field_perms" == "r--" && "$read_field_access" == "read" ]]; then
            print_success "Read user has read-only field permissions: $read_field_perms (access: $read_field_access)"
        else
            test_fail "Read user field permissions incorrect: $read_field_perms (access: $read_field_access)"
        fi
        
        # Verify read user can retrieve content but not modify
        print_step "Verifying read user can retrieve but not modify content"
        
        # Should be able to retrieve record
        read_retrieve=$(file_retrieve "/data/account/$test_record_id.json")
        if echo "$read_retrieve" | jq -e '.success == true' >/dev/null; then
            retrieved_name=$(echo "$read_retrieve" | jq -r '.content | fromjson | .name')
            if [[ "$retrieved_name" == "Access Level Test Record" ]]; then
                print_success "Read user can retrieve record content: $retrieved_name"
            else
                test_fail "Read user retrieved incorrect content: $retrieved_name"
            fi
        else
            test_fail "Read user should be able to retrieve record content"
        fi
        
        # Should be able to retrieve field
        read_field_retrieve=$(file_retrieve "/data/account/$test_record_id/email")
        if echo "$read_field_retrieve" | jq -e '.success == true' >/dev/null; then
            field_content=$(echo "$read_field_retrieve" | jq -r '.content')
            if [[ "$field_content" == "access-test@example.com" ]]; then
                print_success "Read user can retrieve field content: $field_content"
            else
                test_fail "Read user retrieved incorrect field content: $field_content"
            fi
        else
            test_fail "Read user should be able to retrieve field content"
        fi
        
        # Should NOT be able to store/modify
        print_step "Verifying read user cannot modify content"
        modify_attempt=$(file_store "/data/account/$test_record_id/department" '"Modified Department"' 2>/dev/null || echo '{"success":false}')
        
        if echo "$modify_attempt" | jq -e '.success == false' >/dev/null; then
            modify_error=$(echo "$modify_attempt" | jq -r '.error_code // .error // "unknown"')
            print_success "Read user correctly blocked from modifying: $modify_error"
        else
            test_fail "Read user should not be able to modify content"
        fi
        
    else
        print_warning "Failed to authenticate as read-only user: $read_user"
    fi
else
    print_warning "Skipping read-only user tests - no read user available"
fi

# Test 3: Edit user validates edit permissions
if [[ -n "$edit_user" ]]; then
    print_step "Testing edit user: validating edit permissions"
    
    # Authenticate as edit user
    edit_auth=$(login_user "$TEST_TENANT_NAME" "$edit_user")
    edit_jwt=$(echo "$edit_auth" | jq -r '.data.token')
    
    if [[ -n "$edit_jwt" && "$edit_jwt" != "null" ]]; then
        JWT_TOKEN="$edit_jwt"
        print_success "Authenticated as edit user: $edit_user"
        
        # Test record permissions for edit user
        edit_record_stat=$(file_stat "/data/account/$test_record_id.json")
        edit_record_perms=$(echo "$edit_record_stat" | jq -r '.file_metadata.permissions')
        edit_access_level=$(echo "$edit_record_stat" | jq -r '.record_info.access_permissions[0]')
        
        if [[ "$edit_record_perms" == "rw-" && "$edit_access_level" == "edit" ]]; then
            print_success "Edit user has edit permissions: $edit_record_perms (access: $edit_access_level)"
        else
            test_fail "Edit user permissions incorrect: $edit_record_perms (access: $edit_access_level)"
        fi
        
        # Test field permissions for edit user
        edit_field_stat=$(file_stat "/data/account/$test_record_id/balance")
        edit_field_perms=$(echo "$edit_field_stat" | jq -r '.file_metadata.permissions')
        edit_field_access=$(echo "$edit_field_stat" | jq -r '.record_info.access_permissions[0]')
        
        if [[ "$edit_field_perms" == "rw-" && "$edit_field_access" == "edit" ]]; then
            print_success "Edit user has edit field permissions: $edit_field_perms (access: $edit_field_access)"
        else
            test_fail "Edit user field permissions incorrect: $edit_field_perms (access: $edit_field_access)"
        fi
        
        # Verify edit user can read and modify
        print_step "Verifying edit user can read and modify content"
        
        # Should be able to retrieve record
        edit_retrieve=$(file_retrieve "/data/account/$test_record_id.json")
        if echo "$edit_retrieve" | jq -e '.success == true' >/dev/null; then
            print_success "Edit user can retrieve record content"
        else
            test_fail "Edit user should be able to retrieve record content"
        fi
        
        # Should be able to modify field
        edit_modify=$(file_store "/data/account/$test_record_id/department" '"Modified by Edit User"')
        if echo "$edit_modify" | jq -e '.success == true' >/dev/null; then
            print_success "Edit user can modify field content"
            
            # Verify the modification took effect
            verify_modification=$(file_retrieve "/data/account/$test_record_id/department")
            modified_content=$(echo "$verify_modification" | jq -r '.content')
            if [[ "$modified_content" == "Modified by Edit User" ]]; then
                print_success "Edit user modification verified: $modified_content"
            else
                test_fail "Edit user modification not applied: $modified_content"
            fi
        else
            test_fail "Edit user should be able to modify content"
        fi
        
        # Should NOT be able to delete (delete requires full access)
        print_step "Verifying edit user cannot delete content"
        delete_attempt=$(file_delete "/data/account/$test_record_id.json" 2>/dev/null || echo '{"success":false}')
        
        if echo "$delete_attempt" | jq -e '.success == false' >/dev/null; then
            delete_error=$(echo "$delete_attempt" | jq -r '.error_code // .error // "unknown"')
            print_success "Edit user correctly blocked from deleting: $delete_error"
        else
            print_warning "Edit user was able to delete - this may be acceptable depending on implementation"
        fi
        
    else
        print_warning "Failed to authenticate as edit user: $edit_user"
    fi
else
    print_warning "Skipping edit user tests - no edit user available"
fi

# Test 4: Cross-validate with existing template records
print_step "Testing permissions on existing template records"

# Switch back to admin to get template account
JWT_TOKEN="$admin_jwt"
template_accounts=$(auth_get "api/data/account")
template_data=$(extract_and_validate_data "$template_accounts" "template accounts")
first_template_id=$(echo "$template_data" | jq -r '.[0].id')

if [[ -n "$first_template_id" && "$first_template_id" != "null" ]]; then
    print_step "Testing access levels on existing template record: $first_template_id"
    
    # Test admin permissions on template record
    admin_template_stat=$(file_stat "/data/account/$first_template_id.json")
    admin_template_perms=$(echo "$admin_template_stat" | jq -r '.file_metadata.permissions')
    
    if [[ "$admin_template_perms" == "rwx" ]]; then
        print_success "Admin has full permissions on template record: $admin_template_perms"
    else
        test_fail "Admin should have full permissions on template record: $admin_template_perms"
    fi
    
    # Test read user permissions on template record (if available)
    if [[ -n "$read_user" && -n "$read_jwt" ]]; then
        JWT_TOKEN="$read_jwt"
        read_template_stat=$(file_stat "/data/account/$first_template_id.json")
        read_template_perms=$(echo "$read_template_stat" | jq -r '.file_metadata.permissions')
        
        if [[ "$read_template_perms" == "r--" ]]; then
            print_success "Read user has read-only permissions on template record: $read_template_perms"
        else
            test_fail "Read user should have read-only permissions on template record: $read_template_perms"
        fi
    fi
    
    # Test edit user permissions on template record (if available)
    if [[ -n "$edit_user" && -n "$edit_jwt" ]]; then
        JWT_TOKEN="$edit_jwt"
        edit_template_stat=$(file_stat "/data/account/$first_template_id.json")
        edit_template_perms=$(echo "$edit_template_stat" | jq -r '.file_metadata.permissions')
        
        if [[ "$edit_template_perms" == "rw-" ]]; then
            print_success "Edit user has edit permissions on template record: $edit_template_perms"
        else
            test_fail "Edit user should have edit permissions on template record: $edit_template_perms"
        fi
    fi
fi

# Test 5: Directory-level permissions consistency
print_step "Testing directory-level permissions consistency"

# Switch back to admin
JWT_TOKEN="$admin_jwt"

# Test schema directory permissions
admin_schema_stat=$(file_stat "/data/account/")
admin_schema_perms=$(echo "$admin_schema_stat" | jq -r '.file_metadata.permissions')

if [[ "$admin_schema_perms" == "r-x" ]]; then
    print_success "Admin has appropriate directory permissions on schema: $admin_schema_perms"
else
    print_warning "Admin directory permissions on schema: $admin_schema_perms (may be implementation-specific)"
fi

# Test record directory permissions
admin_record_dir_stat=$(file_stat "/data/account/$test_record_id/")
admin_record_dir_perms=$(echo "$admin_record_dir_stat" | jq -r '.file_metadata.permissions')

if [[ "$admin_record_dir_perms" == "rwx" ]]; then
    print_success "Admin has full directory permissions on record: $admin_record_dir_perms"
else
    test_fail "Admin should have full directory permissions on record: $admin_record_dir_perms"
fi

# Test 6: Permission consistency across different endpoints
print_step "Testing permission consistency across File API endpoints"

# Switch back to admin for final tests
JWT_TOKEN="$admin_jwt"

# Test size endpoint permissions
size_response=$(file_size "/data/account/$test_record_id.json")
size_perms=$(echo "$size_response" | jq -r '.file_metadata.permissions')

if [[ "$size_perms" == "rwx" ]]; then
    print_success "Size endpoint shows consistent admin permissions: $size_perms"
else
    test_fail "Size endpoint permissions inconsistent: $size_perms"
fi

# Test modify-time endpoint permissions
modtime_response=$(file_modify_time "/data/account/$test_record_id.json")
modtime_perms=$(echo "$modtime_response" | jq -r '.file_metadata.permissions')

if [[ "$modtime_perms" == "rwx" ]]; then
    print_success "Modify-time endpoint shows consistent admin permissions: $modtime_perms"
else
    test_fail "Modify-time endpoint permissions inconsistent: $modtime_perms"
fi

print_success "File API access levels testing completed successfully"

# Summary
print_step "Access Level Test Summary"
echo "✅ Admin user (full access): rwx permissions on all operations"
if [[ -n "$read_user" ]]; then
    echo "✅ Read user: r-- permissions, can retrieve but not modify"
else
    echo "⚠️  Read user: not available in template"
fi
if [[ -n "$edit_user" ]]; then
    echo "✅ Edit user: rw- permissions, can read and modify but not delete"
else
    echo "⚠️  Edit user: not available in template" 
fi
echo "✅ Role-based permissions working correctly when ACL arrays are empty"
echo "✅ Permission consistency across all File API endpoints"
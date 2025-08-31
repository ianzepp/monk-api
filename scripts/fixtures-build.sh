#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully and provide better visibility

# Simple Fixtures Build Script
# Creates template tenant databases with pre-loaded schemas and data for fast test setup

# Source helpers
SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/../spec/curl-helper.sh"
source "$SCRIPT_DIR/../spec/helpers/test-tenant-helper.sh"

# Configuration
TEMPLATE_NAME="${1:-basic}"
FIXTURES_DIR="fixtures"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

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

fail() {
    print_error "$1"
    exit 1
}

print_header "Building fixtures template: $TEMPLATE_NAME"

# Check prerequisites
if [[ ! -d "$FIXTURES_DIR/schemas" ]]; then
    fail "Fixtures schemas directory not found: $FIXTURES_DIR/schemas"
fi

if [[ ! -d "$FIXTURES_DIR/data" ]]; then
    fail "Fixtures data directory not found: $FIXTURES_DIR/data"
fi

# Wait for server to be ready
print_step "Waiting for server to be ready"
wait_for_server
print_success "Server is ready"

# Step 1: Create isolated tenant for fixture building
print_step "Creating isolated tenant for fixture building"
create_isolated_test_tenant "fixtures_$TEMPLATE_NAME" >/dev/null
tenant_name="$TEST_TENANT_NAME"
template_db_name="$TEST_DATABASE_NAME"

if [[ -z "$tenant_name" || -z "$template_db_name" ]]; then
    fail "Failed to create fixture tenant"
fi

print_success "Created fixture tenant: $tenant_name → $template_db_name"

# Step 2: Authenticate as admin
print_step "Setting up admin authentication"
JWT_TOKEN=$(get_user_token "$tenant_name" "admin")

if [[ -z "$JWT_TOKEN" || "$JWT_TOKEN" == "null" ]]; then
    fail "Failed to authenticate admin user"
fi

export JWT_TOKEN
print_success "Admin authentication configured"

# Step 3: Load all schemas
print_step "Loading schemas from $FIXTURES_DIR/schemas/"

schema_count=0
for schema_file in "$FIXTURES_DIR/schemas"/*.json; do
    if [[ ! -f "$schema_file" ]]; then
        print_warning "No schema files found in $FIXTURES_DIR/schemas/"
        continue
    fi
    
    schema_name=$(basename "$schema_file" .json)
    print_step "Loading schema: $schema_name"
    
    schema_content=$(cat "$schema_file")
    response=$(auth_post "api/meta/$schema_name" "$schema_content")
    
    if echo "$response" | jq -e '.success == true' >/dev/null; then
        print_success "Schema '$schema_name' loaded successfully"
        ((schema_count++))
    else
        print_error "Failed to load schema '$schema_name': $response"
        fail "Schema loading failed"
    fi
done

print_success "Loaded $schema_count schemas"

# Step 4: Load sample data
print_step "Loading sample data from $FIXTURES_DIR/data/"

data_count=0
total_records=0

for data_file in "$FIXTURES_DIR/data"/*.json; do
    if [[ ! -f "$data_file" ]]; then
        print_warning "No data files found in $FIXTURES_DIR/data/"
        continue
    fi
    
    data_name=$(basename "$data_file" .json)
    print_step "Loading data: $data_name"
    
    data_content=$(cat "$data_file")
    
    # Validate that data is an array
    if ! echo "$data_content" | jq -e 'type == "array"' >/dev/null; then
        print_error "Data file $data_file must contain an array of records"
        fail "Data validation failed"
    fi
    
    record_count=$(echo "$data_content" | jq 'length')
    response=$(auth_post "api/data/$data_name" "$data_content")
    
    if echo "$response" | jq -e '.success == true' >/dev/null; then
        print_success "Data '$data_name' loaded: $record_count records"
        ((data_count++))
        ((total_records += record_count))
    else
        print_error "Failed to load data '$data_name': $response"
        fail "Data loading failed"
    fi
done

print_success "Loaded data for $data_count schemas: $total_records total records"

# Step 5: Convert to template database
print_step "Converting to template database"

# Generate template database name
template_db_final="monk_template_$TEMPLATE_NAME"

# Stop server to close database connections before rename
print_step "Stopping server to close database connections"
npm run stop >/dev/null 2>&1 || true
print_success "Server stopped"

# Wait a moment for connections to fully close
sleep 2

# Rename the database
print_step "Renaming database: $template_db_name → $template_db_final"
if psql -d postgres -c "ALTER DATABASE \"$template_db_name\" RENAME TO \"$template_db_final\"" >/dev/null 2>&1; then
    print_success "Database renamed to: $template_db_final"
else
    print_error "Failed to rename database - may need manual cleanup"
    fail "Database rename failed"
fi

# Restart server for continued operations
print_step "Restarting server"
npm run start:bg >/dev/null 2>&1
print_success "Server restarted"

# Step 6: Register as template in tenants table
print_step "Registering template in tenants registry"

# Update the tenant record to mark as template
template_update_sql="
    UPDATE tenants 
    SET database = '$template_db_final', 
        tenant_type = 'template',
        name = 'monk_$TEMPLATE_NAME'
    WHERE name = '$tenant_name'
"

psql -d monk_main -c "$template_update_sql"
print_success "Template registered: monk_$TEMPLATE_NAME → $template_db_final"

# Step 7: Summary
print_header "Fixture Template Build Complete"
echo "Template Name: monk_$TEMPLATE_NAME"
echo "Database Name: $template_db_final"  
echo "Schemas: $schema_count"
echo "Records: $total_records"
echo ""
print_success "Template ready for test cloning via PostgreSQL CREATE DATABASE WITH TEMPLATE"

# Verify template exists
print_step "Verifying template registration"
template_check=$(psql -d monk_main -t -c "SELECT COUNT(*) FROM tenants WHERE name = 'monk_$TEMPLATE_NAME' AND tenant_type = 'template'" | xargs)

if [[ "$template_check" == "1" ]]; then
    print_success "Template successfully registered and ready for use"
else
    fail "Template registration verification failed"
fi
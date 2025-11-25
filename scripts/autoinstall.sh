#!/usr/bin/env bash
set -e

# Monk API Automated Fresh Install Script
# Simplified version that focuses on developer experience:
# - Auto-detects PostgreSQL configuration
# - Creates/populates .env file automatically
# - Delegates database setup to npm run install:db
#
# Usage: npm run autoinstall
#        scripts/autoinstall.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Output formatting functions
print_header() {
    echo
    echo -e "${BOLD}${BLUE}=== $1 ===${NC}"
    echo
}

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}" >&2
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Error handling function
handle_error() {
    local step="$1"
    local suggestion="$2"

    print_error "Failed during: $step"
    if [ -n "$suggestion" ]; then
        print_info "Suggestion: $suggestion"
    fi

    print_info "Check INSTALL.md for manual setup instructions"
    exit 1
}

# Function to auto-detect PostgreSQL authentication
autodetect_database_auth() {
    local detected_url=""

    # First check if DATABASE_URL is already set in environment
    if [ -n "$DATABASE_URL" ]; then
        print_info "Using DATABASE_URL from environment" >&2
        echo "$DATABASE_URL"
        return 0
    fi

    # Test PostgreSQL connectivity first
    if ! psql -d postgres -c "SELECT version();" >/dev/null 2>&1; then
        return 1
    fi

    # Get current system info
    local current_user=$(whoami)
    local system_os=$(uname -s)

    # Define test configurations based on platform and common defaults
    local test_urls=()

    if [ "$system_os" = "Darwin" ]; then
        # macOS: Homebrew and Postgres.app typically use current user with trust auth
        test_urls=(
            "postgresql://$current_user@localhost:5432/"
            "postgresql://postgres@localhost:5432/"
            "postgresql://$current_user:$current_user@localhost:5432/"
            "postgresql://postgres:postgres@localhost:5432/"
        )
        print_info "Detected macOS - testing Homebrew/Postgres.app patterns first" >&2
    else
        # Linux: Package managers typically use postgres user with peer/trust auth
        test_urls=(
            "postgresql://postgres@localhost:5432/"
            "postgresql://$current_user@localhost:5432/"
            "postgresql://$current_user:$current_user@localhost:5432/"
            "postgresql://postgres:postgres@localhost:5432/"
        )
        print_info "Detected Linux - testing package manager patterns first" >&2
    fi

    # Test each configuration
    for test_url in "${test_urls[@]}"; do
        # Extract password if present for PGPASSWORD
        local password=""
        if [[ "$test_url" == *":"*"@"* ]]; then
            password=$(echo "$test_url" | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p')
        fi

        # Test connection
        if [ -n "$password" ]; then
            if PGPASSWORD="$password" psql "$test_url" -c "SELECT 1;" >/dev/null 2>&1; then
                detected_url="$test_url"
                break
            fi
        else
            if psql "$test_url" -c "SELECT 1;" >/dev/null 2>&1; then
                detected_url="$test_url"
                break
            fi
        fi
    done

    if [ -n "$detected_url" ]; then
        echo "$detected_url"
        return 0
    else
        return 1
    fi
}

print_header "Monk API Automated Fresh Install"
print_info "This script will set up a complete development environment"
echo

# Step 1: Verify PostgreSQL Connection and .env Configuration
print_header "Step 1: Verify PostgreSQL Connection and .env Configuration"

print_step "Testing PostgreSQL connectivity..."

if psql -d postgres -c "SELECT version();" >/dev/null 2>&1; then
    print_success "PostgreSQL connection verified"
    # Get PostgreSQL version for info
    pg_version=$(psql -d postgres -t -c "SELECT version();" 2>/dev/null | xargs | cut -d' ' -f1-2)
    print_info "PostgreSQL Version: $pg_version"
else
    handle_error "PostgreSQL connection test" "Ensure PostgreSQL is running and you can connect. See INSTALL.md prerequisites."
fi

print_step "Checking .env configuration..."

# Check if .env file exists
if [ -f ".env" ]; then
    print_success ".env file found"
    if grep -q "DATABASE_URL=" ".env"; then
        db_url=$(grep "DATABASE_URL=" ".env" | cut -d'=' -f2-)
        if [ -n "$db_url" ] && [ "$db_url" != "postgresql://username:password@localhost:5432/" ]; then
            print_success "DATABASE_URL configured in .env"
            print_info ".env file: $(pwd)/.env"
        else
            print_warning "DATABASE_URL in .env needs to be configured"
            print_info "Please edit .env file with your PostgreSQL credentials and re-run this script"
            exit 1
        fi
    else
        print_warning ".env file exists but missing DATABASE_URL"
        print_info "Please add DATABASE_URL to your .env file and re-run this script"
        exit 1
    fi
else
    print_warning "No .env file found"
    print_step "Creating .env file from .env.example..."

    if [ ! -f ".env.example" ]; then
        handle_error ".env.example file not found" "Ensure you're running this from the project root directory"
    fi

    # Copy .env.example to .env
    cp ".env.example" ".env"

    # Try to auto-detect DATABASE_URL
    print_step "Attempting to auto-detect PostgreSQL configuration..."

    if detected_url=$(autodetect_database_auth); then
        # Update .env with detected DATABASE_URL using a safer approach
        # Create a temporary file to avoid sed escaping issues
        temp_file=$(mktemp)
        while IFS= read -r line; do
            if [[ "$line" == DATABASE_URL=* ]]; then
                echo "DATABASE_URL=$detected_url"
            else
                echo "$line"
            fi
        done < ".env" > "$temp_file"
        mv "$temp_file" ".env"
        print_success "Auto-detected PostgreSQL configuration"
        print_info "Updated .env with: $detected_url"
    else
        print_warning "Could not auto-detect PostgreSQL configuration"
        print_info "Created .env file with placeholder DATABASE_URL"
        print_info "Please edit .env file with your PostgreSQL credentials:"
        print_info "  DATABASE_URL=postgresql://username:password@localhost:5432/"
        print_info "Then re-run this script: npm run autoinstall"
        exit 1
    fi
fi

# Step 2: Install Dependencies
print_header "Step 2: Install Dependencies"

print_step "Installing npm dependencies..."
if npm install; then
    print_success "Dependencies installed successfully"
else
    handle_error "Dependency installation" "Check package.json exists and npm is properly configured"
fi

# Step 3: Initialize Database
print_header "Step 3: Initialize Database"

print_step "Running database initialization..."
if npm run install:db; then
    print_success "Database initialized successfully"
else
    handle_error "Database initialization" "Check PostgreSQL connection and permissions"
fi

# Step 4: Build TypeScript
print_header "Step 4: Build TypeScript"

print_step "Building project..."
if npm run build; then
    print_success "TypeScript build successful"
else
    handle_error "TypeScript build" "Check for syntax errors or missing dependencies"
fi

# Setup Complete
print_header "Setup Complete"
print_success "Monk API setup completed successfully!"
echo
print_info "Environment ready for development:"
print_info "• PostgreSQL: Connected and configured"
print_info "• Monk database: Initialized with infrastructure tables"
print_info "• TypeScript: Built and ready"
print_info "• Local server: http://localhost:9001"
echo
print_info "Next steps:"
print_info "• Start the server: npm run start"
print_info "• Register a tenant: POST /auth/register"
print_info "• Deploy fixtures: POST /auth/templates"
echo

#!/usr/bin/env bash
set -e

# Monk API Automated Fresh Install Script
# This script automates all the setup steps from INSTALL.md for a complete
# development environment ready for npm run test:all
#
# Usage: npm run autoinstall [options]
#        scripts/autoinstall.sh [options]
#
# Options:
#   --clean-node    Delete node_modules and reinstall dependencies
#   --clean-dist    Delete dist/ directory and recompile TypeScript
#   --clean-auth    Delete and recreate monk_main database
#   --force         Run all --clean-* operations for complete fresh install
#   --help          Show this help message
#
# What this script does:
# 1. Verify PostgreSQL connection (prerequisite check)
# 2. Compile TypeScript code
# 3. Initialize auth database with proper schema
# 4. Configure local server settings
# 5. Create and configure test tenant
# 6. Verify complete setup by testing connectivity
#
# Prerequisites (user must handle externally):
# - Node.js 18+ and npm installed
# - PostgreSQL server running and accessible
# - User can connect to PostgreSQL (psql -d postgres -c "SELECT version();")

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

# Parse command line arguments
CLEAN_NODE=false
CLEAN_DIST=false
CLEAN_AUTH=false
FORCE_CLEAN=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean-node)
            CLEAN_NODE=true
            shift
            ;;
        --clean-dist)
            CLEAN_DIST=true
            shift
            ;;
        --clean-auth)
            CLEAN_AUTH=true
            shift
            ;;
        --force)
            FORCE_CLEAN=true
            CLEAN_NODE=true
            CLEAN_DIST=true
            CLEAN_AUTH=true
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            print_info "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Show help if requested
if [ "$SHOW_HELP" = true ]; then
    echo "Monk API Automated Fresh Install Script"
    echo
    echo "Usage: npm run autoinstall [options]"
    echo "       scripts/autoinstall.sh [options]"
    echo
    echo "Options:"
    echo "  --clean-node    Delete node_modules and reinstall dependencies"
    echo "  --clean-dist    Delete dist/ directory and recompile TypeScript"
    echo "  --clean-auth    Delete and recreate monk_main database"
    echo "  --force         Run all --clean-* operations for complete fresh install"
    echo "  --help, -h      Show this help message"
    echo
    echo "This script automates all setup steps from INSTALL.md for a complete"
    echo "development environment ready for npm run test:all"
    exit 0
fi

print_header "Monk API Automated Fresh Install"
print_info "This script will set up a complete development environment"
print_info "Following the steps from INSTALL.md automatically"

# Show force mode status
if [ "$FORCE_CLEAN" = true ]; then
    print_warning "FORCE MODE: Will clean all components (node_modules, dist, auth database)"
fi
echo

# Function to auto-detect PostgreSQL authentication
autodetect_database_auth() {
    local detected_url=""
    
    # First check if DATABASE_URL is already set in environment
    if [ -n "$DATABASE_URL" ]; then
        print_info "Using DATABASE_URL from environment"
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
        print_info "Detected macOS - testing Homebrew/Postgres.app patterns first"
    else
        # Linux: Package managers typically use postgres user with peer/trust auth
        test_urls=(
            "postgresql://postgres@localhost:5432/"
            "postgresql://$current_user@localhost:5432/"
            "postgresql://$current_user:$current_user@localhost:5432/"
            "postgresql://postgres:postgres@localhost:5432/"
        )
        print_info "Detected Linux - testing package manager patterns first"
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

# Starting: Verify PostgreSQL Connection and .env Configuration
print_header "Starting: Verify PostgreSQL Connection and .env Configuration"

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

# Starting: Install Dependencies
print_header "Starting: Install Dependencies"

# Handle --clean-node option
if [ "$CLEAN_NODE" = true ]; then
    print_step "Clean node install requested - removing node_modules..."
    if [ -d "node_modules" ]; then
        rm -rf node_modules
        print_success "node_modules directory removed"
    else
        print_info "node_modules directory did not exist"
    fi
fi

print_step "Checking if dependencies are installed..."

if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ] && [ "$CLEAN_NODE" = false ]; then
    print_success "Dependencies already installed"
    print_info "Skipping npm install (use --clean-node to force reinstall)"
else
    print_step "Installing npm dependencies..."
    if npm install >/dev/null 2>&1; then
        print_success "Dependencies installed successfully"
        # Show some stats
        dep_count=$(ls node_modules | wc -l 2>/dev/null || echo "unknown")
        print_info "Installed packages: $dep_count"
    else
        handle_error "Dependency installation" "Check package.json exists and npm is properly configured"
    fi
fi

# Starting: Build TypeScript
print_header "Starting: Build TypeScript"

# Handle --clean-dist option
if [ "$CLEAN_DIST" = true ]; then
    print_step "Clean dist requested - removing dist/ directory..."
    if [ -d "dist" ]; then
        rm -rf dist
        print_success "dist/ directory removed"
    else
        print_info "dist/ directory did not exist"
    fi
fi

print_step "Building project..."

if npm run build >/dev/null 2>&1; then
    print_success "TypeScript build successful"
    print_info "Generated files in dist/ directory"

    # Show compilation stats
    if [ -d "dist" ]; then
        file_count=$(find dist -name "*.js" | wc -l 2>/dev/null || echo "unknown")
        print_info "Built JavaScript files: $file_count"
    fi
else
    handle_error "TypeScript build" "Check for syntax errors or missing dependencies"
fi

# Starting: Initialize Main Database
print_header "Starting: Initialize Main Database"

# Handle --clean-auth option
if [ "$CLEAN_AUTH" = true ]; then
    print_step "Clean main database requested - removing existing monk_main database..."
    if psql -lqt | cut -d'|' -f1 | grep -qw "monk_main" 2>/dev/null; then
        if dropdb monk_main 2>/dev/null; then
            print_success "Existing main database removed"
        else
            handle_error "Main database removal" "Check PostgreSQL permissions for dropping databases"
        fi
    else
        print_info "Main database did not exist"
    fi
fi

print_step "Checking if main database exists..."

# Check if main database already exists
if psql -lqt | cut -d'|' -f1 | grep -qw "monk_main" 2>/dev/null; then
    print_info "Main database already exists"

    # Check if it has the required tables
    if psql -d monk_main -c "SELECT 1 FROM tenant LIMIT 1;" >/dev/null 2>&1; then
        print_success "Main database properly initialized"
        # Show tenant count
        tenant_count=$(psql -d monk_main -t -c "SELECT COUNT(*) FROM tenant;" 2>/dev/null | xargs)
        print_info "Existing tenants: $tenant_count"
    else
        print_warning "Main database exists but may need initialization"
        print_step "Re-initializing main database schema..."
        if psql -d monk_main -f sql/init-monk-main.sql >/dev/null 2>&1; then
            print_success "Main database schema updated"
        else
            handle_error "Main database schema initialization" "Check sql/init-monk-main.sql file exists and PostgreSQL permissions"
        fi
    fi
else
    print_step "Creating main database..."
    if createdb monk_main 2>/dev/null; then
        print_success "Main database created"
    else
        handle_error "Main database creation" "Check PostgreSQL permissions and that createdb command is available"
    fi

    print_step "Initializing main database schema..."
    if psql -d monk_main -f sql/init-monk-main.sql >/dev/null 2>&1; then
        print_success "Main database schema initialized"
        print_info "Created tenant table with indexes and triggers"
        print_info "Added default system tenant"
    else
        handle_error "Main database schema initialization" "Check sql/init-monk-main.sql file exists and PostgreSQL permissions"
    fi
fi

# Starting: Create Default Development Tenant
print_header "Starting: Create Default Development Tenant"

print_step "Creating default 'system' tenant database for development..."

# Check if system database already exists
if psql -lqt | cut -d'|' -f1 | grep -qw "system" 2>/dev/null; then
    print_info "System tenant database already exists"

    # Check if it has users table
    if psql -d system -c "SELECT 1 FROM users LIMIT 1;" >/dev/null 2>&1; then
        print_success "System tenant database properly initialized"
        user_count=$(psql -d system -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs)
        print_info "System tenant users: $user_count"
    else
        print_warning "System database exists but needs initialization"
        print_step "Re-initializing system tenant schema..."
        if psql -d system -f sql/init-tenant.sql >/dev/null 2>&1; then
            print_success "System tenant schema updated"
        else
            handle_error "System tenant schema initialization" "Check sql/init-tenant.sql file exists"
        fi
    fi
else
    print_step "Creating system tenant database..."
    if createdb system 2>/dev/null; then
        print_success "System tenant database created"
    else
        handle_error "System tenant database creation" "Check PostgreSQL permissions for creating databases"
    fi

    print_step "Initializing system tenant schema..."
    if psql -d system -f sql/init-tenant.sql >/dev/null 2>&1; then
        print_success "System tenant schema initialized"
    else
        handle_error "System tenant schema initialization" "Check sql/init-tenant.sql file exists"
    fi
fi

# Create default development users
print_step "Creating default development users..."
user_sql="
    INSERT INTO users (name, auth, access, access_read, access_edit, access_full) VALUES
    ('Development Root User', 'root', 'root', '{}', '{}', '{}'),
    ('Development Admin User', 'admin', 'full', '{}', '{}', '{}'),
    ('Development User', 'user', 'edit', '{}', '{}', '{}')
    ON CONFLICT (auth) DO NOTHING
"

if psql -d system -c "$user_sql" >/dev/null 2>&1; then
    print_success "Development users created (root, admin, user)"
    print_info "You can now login with: tenant='system', username='root'/'admin'/'user'"
else
    print_warning "Failed to create development users (may already exist)"
fi

# Starting: Setup Complete
print_header "Starting: Setup Complete"
print_success "Monk API setup completed successfully!"
echo
print_info "Environment ready for development:"
print_info "• PostgreSQL: Connected and configured"
print_info "• Main database (monk_main): Initialized with schema"
print_info "• System tenant: Database created with test users"
print_info "• TypeScript: Built and ready"
print_info "• Local server: http://localhost:9001"
echo
print_info "Ready for immediate use:"
print_info "• Login: curl -X POST http://localhost:9001/auth/login -d '{\"tenant\":\"system\",\"username\":\"root\"}'"
print_info "• Test: npm run start:bg && ./spec/run-series.sh 01-basic; npm run stop"
print_info "• Development: npm run start:dev"
echo
print_info "Available development users:"
print_info "• root@system (root access) - Full administrative privileges"
print_info "• admin@system (full access) - Administrative operations"
print_info "• user@system (edit access) - Standard user operations"
echo
print_success "Ready for development!"

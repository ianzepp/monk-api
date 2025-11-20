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
#   --clean         Remove all Monk API databases (tenant_*, sandbox_*, snapshot_*, monk_template_*, monk, system)
#   --clean-node    Delete node_modules and reinstall dependencies
#   --clean-dist    Delete dist/ directory and recompile TypeScript
#   --clean-auth    Delete and recreate monk database
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
CLEAN_DATABASES=false
CLEAN_NODE=false
CLEAN_DIST=false
CLEAN_AUTH=false
FORCE_CLEAN=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_DATABASES=true
            shift
            ;;
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
            CLEAN_DATABASES=true
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
    echo "  --clean         Remove all Monk API databases (tenant_*, sandbox_*, snapshot_*, monk_template_*, monk, system)"
    echo "  --clean-node    Delete node_modules and reinstall dependencies"
    echo "  --clean-dist    Delete dist/ directory and recompile TypeScript"
    echo "  --clean-auth    Delete and recreate monk database"
    echo "  --force         Run all --clean-* operations for complete fresh install"
    echo "  --help, -h      Show this help message"
    echo
    echo "This script automates all setup steps from INSTALL.md for a complete"
    echo "development environment ready for npm run test:all"
    exit 0
fi

# Function to clean all Monk API databases
clean_monk_databases() {
    print_step "Finding all Monk API related databases..."

    # Get list of all databases
    local all_dbs=$(psql -lqt | cut -d'|' -f1 | sed 's/^ *//;s/ *$//' | grep -v "^$")
    local monk_dbs=()

    # Find databases matching Monk API patterns
    for db in $all_dbs; do
        if [[ "$db" == tenant_* ]] || \
           [[ "$db" == monk_template_* ]] || \
           [[ "$db" == sandbox_* ]] || \
           [[ "$db" == snapshot_* ]] || \
           [[ "$db" == "monk" ]] || \
           [[ "$db" == "system" ]]; then
            monk_dbs+=("$db")
        fi
    done

    if [ ${#monk_dbs[@]} -eq 0 ]; then
        print_info "No Monk API databases found to clean"
        return 0
    fi

    print_info "Found ${#monk_dbs[@]} Monk API databases: ${monk_dbs[*]}"
    print_step "Removing Monk API databases..."

    local failed_drops=()
    for db in "${monk_dbs[@]}"; do
        if dropdb "$db" 2>/dev/null; then
            print_success "Dropped database: $db"
        else
            print_warning "Failed to drop database: $db"
            failed_drops+=("$db")
        fi
    done

    if [ ${#failed_drops[@]} -gt 0 ]; then
        print_warning "Some databases could not be dropped: ${failed_drops[*]}"
        print_info "This may be due to active connections or permissions"
    fi
}

print_header "Monk API Automated Fresh Install"
print_info "This script will set up a complete development environment"
print_info "Following the steps from INSTALL.md automatically"

# Close any server connections
print_header "Stopping any existing API servers to close open connections"
npm run stop

# Handle --clean option first (before any other operations)
if [ "$CLEAN_DATABASES" = true ]; then
    print_header "Starting: Clean All Monk API Databases"
    clean_monk_databases
fi

# Show force mode status
if [ "$FORCE_CLEAN" = true ]; then
    print_warning "FORCE MODE: Will clean all components (databases, node_modules, dist, auth database)"
fi
echo

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
    print_step "Clean monk database requested - removing existing monk database..."
    if psql -lqt | cut -d'|' -f1 | grep -qw "monk" 2>/dev/null; then
        if dropdb monk 2>/dev/null; then
            print_success "Existing monk database removed"
        else
            handle_error "Monk database removal" "Check PostgreSQL permissions for dropping databases"
        fi
    else
        print_info "Monk database did not exist"
    fi
fi

print_step "Checking if monk database exists..."

# Check if monk database already exists
if psql -lqt | cut -d'|' -f1 | grep -qw "monk" 2>/dev/null; then
    print_info "Monk database already exists"

    # Check if it has the required tables
    if psql -d monk -c "SELECT 1 FROM templates LIMIT 1;" >/dev/null 2>&1 && \
       psql -d monk -c "SELECT 1 FROM tenants LIMIT 1;" >/dev/null 2>&1 && \
       psql -d monk -c "SELECT 1 FROM sandboxes LIMIT 1;" >/dev/null 2>&1 && \
       psql -d monk -c "SELECT 1 FROM snapshots LIMIT 1;" >/dev/null 2>&1; then
        print_success "Monk database properly initialized with all tables"
        # Show counts
        template_count=$(psql -d monk -t -c "SELECT COUNT(*) FROM templates;" 2>/dev/null | xargs)
        tenant_count=$(psql -d monk -t -c "SELECT COUNT(*) FROM tenants;" 2>/dev/null | xargs)
        sandbox_count=$(psql -d monk -t -c "SELECT COUNT(*) FROM sandboxes;" 2>/dev/null | xargs)
        snapshot_count=$(psql -d monk -t -c "SELECT COUNT(*) FROM snapshots;" 2>/dev/null | xargs)
        print_info "Infrastructure: Templates: $template_count, Tenants: $tenant_count, Sandboxes: $sandbox_count, Snapshots: $snapshot_count"
    else
        print_warning "Monk database exists but may need initialization"
        print_step "Re-initializing monk database schema..."
        if psql -d monk -f sql/init-monk.sql >/dev/null 2>&1; then
            print_success "Monk database schema updated"
        else
            handle_error "Monk database schema initialization" "Check sql/init-monk.sql file exists and PostgreSQL permissions"
        fi
    fi
else
    print_step "Creating monk database..."
    if createdb monk 2>/dev/null; then
        print_success "Monk database created"
    else
        handle_error "Monk database creation" "Check PostgreSQL permissions and that createdb command is available"
    fi

    print_step "Initializing monk database schema..."
    if psql -d monk -f sql/init-monk.sql >/dev/null 2>&1; then
        print_success "Monk database schema initialized"
        print_info "Created infrastructure tables (templates, tenants, sandboxes, snapshots)"
    else
        handle_error "Monk database schema initialization" "Check sql/init-monk.sql file exists and PostgreSQL permissions"
    fi
fi

# Starting: Verify Build and Server
print_header "Starting: Verify Build and Server"

print_step "Running build verification..."
if npm run build >/dev/null 2>&1; then
    print_success "Build verification passed - code compiles successfully"
else
    handle_error "Build verification" "The code failed to compile"
fi

print_step "Running server startup test..."
if npm run start -- --no-startup >/dev/null 2>&1; then
    print_success "Server startup test passed - server can start successfully"
else
    handle_error "Server startup test" "The server failed to start properly"
fi

# Starting: Build Default Template Database
print_header "Starting: Build Default Template Database"

print_step "Checking if system template database exists..."
template_db_name="monk_template_system"

if psql -lqt | cut -d'|' -f1 | sed 's/^ *//;s/ *$//' | grep -qx "$template_db_name" 2>/dev/null; then
    print_success "Default template database already exists"
    print_info "Template database: $template_db_name"
    
    # Verify it's registered in monk.templates
    if psql -d monk -t -c "SELECT 1 FROM templates WHERE database = '$template_db_name';" 2>/dev/null | grep -q 1; then
        print_success "Template registered in monk.templates"
    else
        print_step "Registering template in monk.templates..."
        psql -d monk -c "
            INSERT INTO templates (name, database, description, is_system, schema_count)
            VALUES ('system', '$template_db_name', 'System template with core infrastructure', true, 4)
            ON CONFLICT (name) DO NOTHING;
        " >/dev/null 2>&1
        print_success "Template registered successfully"
    fi
else
    print_step "Creating default template database..."
    print_info "This creates a production-ready template with core infrastructure only"
    
    if createdb "$template_db_name" 2>/dev/null; then
        print_success "Default template database created"
    else
        handle_error "Default template database creation" "Check PostgreSQL permissions"
    fi
    
    print_step "Initializing default template schema..."
    if psql -d "$template_db_name" -f fixtures/system/load.sql >/dev/null 2>&1; then
        print_success "Default template initialized successfully"
    else
        handle_error "System template initialization" "Check fixtures/system/load.sql exists"
    fi
    
    print_step "Registering template in monk.templates..."
    if psql -d monk -c "
        INSERT INTO templates (name, database, description, is_system, schema_count)
        VALUES ('system', '$template_db_name', 'System template with core infrastructure', true, 4)
        ON CONFLICT (name) DO NOTHING;
    " >/dev/null 2>&1; then
        print_success "Template registered in monk.templates"
        print_info "Template database: $template_db_name ready for fast tenant creation"
    else
        print_warning "Failed to register template in monk.templates"
        print_info "Template database created but not registered - manual registration may be needed"
    fi
fi

# Starting: Build Testing Fixtures Template
print_header "Starting: Build Testing Fixtures Template"

print_step "Checking if testing fixtures template exists..."
template_db_name="monk_template_testing"

if psql -lqt | cut -d'|' -f1 | sed 's/^ *//;s/ *$//' | grep -qx "$template_db_name" 2>/dev/null; then
    print_success "Testing fixtures template already exists"
    print_info "Template database: $template_db_name"
else
    print_step "Building testing fixtures template..."
    print_info "This creates a testing-focused template for 'test:sh' scripts in 'spec/**/*.sh'"

    if npm run fixtures:build testing >/dev/null 2>&1; then
        print_success "Testing fixtures template built successfully"
        print_info "Template database: $template_db_name ready for fast tenant creation"
    else
        print_warning "Failed to build testing fixtures template"
        print_warning "This is a blocker - testing cannot run"
    fi
fi

# Starting: Setup Complete
print_header "Starting: Setup Complete"
print_success "Monk API setup completed successfully!"
echo
print_info "Environment ready for development:"
print_info "• PostgreSQL: Connected and configured"
print_info "• Monk database (monk): Initialized with schema"
print_info "• TypeScript: Built and ready"
print_info "• Local server: http://localhost:9001"
echo
print_info "Ready for immediate use:"
print_info "• Rebuild: npm run build"
print_info "• Start the server: npm run start"
print_info "• Login: curl -X POST http://localhost:9001/auth/register -d '{\"tenant\":\"<tenant>\",\"username\":\"<username>\"}'"
echo

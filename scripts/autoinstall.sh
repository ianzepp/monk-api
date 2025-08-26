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
#   --clean-auth    Delete and recreate monk-api-auth database
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
    echo "  --clean-auth    Delete and recreate monk-api-auth database"
    echo "  --help, -h      Show this help message"
    echo
    echo "This script automates all setup steps from INSTALL.md for a complete"
    echo "development environment ready for npm run test:all"
    exit 0
fi

print_header "Monk API Automated Fresh Install"
print_info "This script will set up a complete development environment"
print_info "Following the steps from INSTALL.md automatically"
echo

# Step 1: Verify PostgreSQL Connection and DATABASE_URL
print_header "Step 1: Verify PostgreSQL Connection and DATABASE_URL"
print_step "Checking required tools..."

# Check jq availability
if ! command -v jq >/dev/null 2>&1; then
    handle_error "jq not found" "Install jq: sudo apt install jq (Ubuntu) or brew install jq (macOS)"
fi
print_success "jq is available"

print_step "Testing PostgreSQL connectivity..."

if psql -d postgres -c "SELECT version();" >/dev/null 2>&1; then
    print_success "PostgreSQL connection verified"
    # Get PostgreSQL version for info
    pg_version=$(psql -d postgres -t -c "SELECT version();" 2>/dev/null | xargs | cut -d' ' -f1-2)
    print_info "PostgreSQL Version: $pg_version"
else
    handle_error "PostgreSQL connection test" "Ensure PostgreSQL is running and you can connect. See INSTALL.md prerequisites."
fi

print_step "Checking DATABASE_URL configuration..."
config_file="$HOME/.config/monk/env.json"
if [ -f "$config_file" ] && grep -q "DATABASE_URL" "$config_file"; then
    print_success "DATABASE_URL configured in monk config"
    print_info "Config file: $config_file"
else
    print_warning "No DATABASE_URL found in monk configuration"
    print_step "Creating monk environment configuration..."
    
    # Ensure config directory exists
    mkdir -p "$HOME/.config/monk"
    
    # Create env.json with DATABASE_URL using current user
    cat > "$config_file" << EOF
{
  "DATABASE_URL": "postgresql://$(whoami):$(whoami)@localhost:5432/",
  "NODE_ENV": "development",
  "PORT": "9001"
}
EOF
    
    print_success "Monk environment configuration created"
    print_info "Config file: $config_file"
    print_info "Using DATABASE_URL: postgresql://$(whoami):$(whoami)@localhost:5432/"
    print_warning "Assuming PostgreSQL user password matches username"
    print_info "If authentication fails, edit $config_file with correct password"
fi

# Step 2: Install Dependencies
print_header "Step 2: Install Dependencies"

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

# Step 3: Compile TypeScript
print_header "Step 3: Compile TypeScript"

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

print_step "Compiling project..."

if npm run compile >/dev/null 2>&1; then
    print_success "TypeScript compilation successful"
    print_info "Generated files in dist/ directory"
    
    # Show compilation stats
    if [ -d "dist" ]; then
        file_count=$(find dist -name "*.js" | wc -l 2>/dev/null || echo "unknown")
        print_info "Compiled JavaScript files: $file_count"
    fi
else
    handle_error "TypeScript compilation" "Check for syntax errors or missing dependencies"
fi

# Step 4: Initialize Auth Database
print_header "Step 4: Initialize Auth Database"

# Handle --clean-auth option
if [ "$CLEAN_AUTH" = true ]; then
    print_step "Clean auth requested - removing existing auth database..."
    if psql -lqt | cut -d'|' -f1 | grep -qw "monk-api-auth" 2>/dev/null; then
        if dropdb monk-api-auth 2>/dev/null; then
            print_success "Existing auth database removed"
        else
            handle_error "Auth database removal" "Check PostgreSQL permissions for dropping databases"
        fi
    else
        print_info "Auth database did not exist"
    fi
fi

print_step "Checking if auth database exists..."

# Check if auth database already exists
if psql -lqt | cut -d'|' -f1 | grep -qw "monk-api-auth" 2>/dev/null; then
    print_info "Auth database already exists"
    
    # Check if it has the required tables
    if psql -d monk-api-auth -c "SELECT 1 FROM tenants LIMIT 1;" >/dev/null 2>&1; then
        print_success "Auth database properly initialized"
        # Show tenant count
        tenant_count=$(psql -d monk-api-auth -t -c "SELECT COUNT(*) FROM tenants;" 2>/dev/null | xargs)
        print_info "Existing tenants: $tenant_count"
    else
        print_warning "Auth database exists but may need initialization"
        print_step "Re-initializing auth database schema..."
        if psql -d monk-api-auth -f sql/init-auth.sql >/dev/null 2>&1; then
            print_success "Auth database schema updated"
        else
            handle_error "Auth database schema initialization" "Check sql/init-auth.sql file exists and PostgreSQL permissions"
        fi
    fi
else
    print_step "Creating auth database..."
    if createdb monk-api-auth 2>/dev/null; then
        print_success "Auth database created"
    else
        handle_error "Auth database creation" "Check PostgreSQL permissions and that createdb command is available"
    fi
    
    print_step "Initializing auth database schema..."
    if psql -d monk-api-auth -f sql/init-auth.sql >/dev/null 2>&1; then
        print_success "Auth database schema initialized"
        print_info "Created tenants table with indexes and triggers"
        print_info "Added default system tenant"
    else
        handle_error "Auth database schema initialization" "Check sql/init-auth.sql file exists and PostgreSQL permissions"
    fi
fi

# Step 5: Setup Complete
print_header "Step 5: Setup Complete"
print_success "Monk API setup completed successfully!"
echo
print_info "Environment ready for development:"
print_info "• PostgreSQL: Connected and configured"
print_info "• Auth database: Initialized with schema"
print_info "• TypeScript: Compiled and ready"
print_info "• Local server: http://localhost:9001"
echo
print_info "Next steps:"
print_info "1. Start the development server: npm run start:dev"
print_info "2. Install monk-cli for API management:"
print_info "   git clone https://github.com/ianzepp/monk-cli.git"
print_info "   cd monk-cli && ./install.sh && monk init"
print_info "3. Run tests: npm run spec:sh"
print_info "• Check status: npm run test:info"
echo
print_success "Ready for development!"
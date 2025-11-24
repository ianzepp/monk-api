#!/bin/bash
set -euo pipefail

#
# Database Installation Script for Monk API
#
# Creates the core "monk" database and deploys infrastructure tables.
# Focused solely on database setup - does not install npm packages.
#
# Usage:
#   npm run install:db           # Create monk DB if not exists
#   npm run install:db -- --force  # Drop and recreate monk DB
#   npm run install:db -- --drop   # Drop and recreate monk DB (alias)
#

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Script directory and project root
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly INFRASTRUCTURE_SQL="$PROJECT_ROOT/fixtures/infrastructure/init.sql"

# PostgreSQL connection settings (use defaults from environment or psql config)
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="postgres"  # Connect to postgres DB first to create monk DB

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if PostgreSQL is accessible
check_postgres_connection() {
    log_step "Checking PostgreSQL connection..."

    if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1" > /dev/null 2>&1; then
        log_error "Cannot connect to PostgreSQL at ${PGHOST}:${PGPORT}"
        log_error "Please ensure PostgreSQL is running and credentials are correct"
        log_error "Connection settings: PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER"
        exit 1
    fi

    log_info "PostgreSQL connection successful"
}

# Check if monk database exists
db_exists() {
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc \
        "SELECT 1 FROM pg_database WHERE datname='monk'" | grep -q 1
}

# Drop monk database
drop_database() {
    log_step "Dropping monk database..."

    if db_exists; then
        # Terminate existing connections
        psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c \
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'monk' AND pid <> pg_backend_pid();" \
            > /dev/null 2>&1 || true

        # Drop database
        psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "DROP DATABASE monk;" > /dev/null
        log_info "Dropped existing monk database"
    else
        log_info "No existing monk database to drop"
    fi
}

# Create monk database
create_database() {
    log_step "Creating monk database..."

    if db_exists; then
        log_info "monk database already exists"
        return 0
    fi

    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "CREATE DATABASE monk;" > /dev/null
    log_info "Created monk database"
}

# Deploy infrastructure tables
deploy_infrastructure() {
    log_step "Deploying infrastructure tables..."

    if [[ ! -f "$INFRASTRUCTURE_SQL" ]]; then
        log_error "Infrastructure SQL file not found: $INFRASTRUCTURE_SQL"
        exit 1
    fi

    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "monk" -f "$INFRASTRUCTURE_SQL" > /dev/null
    log_info "Deployed infrastructure tables"
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."

    local table_count=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "monk" -tAc \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")

    if [[ "$table_count" -eq 0 ]]; then
        log_error "No tables found in monk database"
        exit 1
    fi

    log_info "Found $table_count tables in monk database"

    # List tables
    log_info "Tables installed:"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "monk" -c \
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
}

# Main installation flow
main() {
    cd "$PROJECT_ROOT"

    local force_mode=false

    # Parse command line arguments
    for arg in "$@"; do
        case $arg in
            --force|--drop)
                force_mode=true
                shift
                ;;
            --help|-h)
                echo "Usage: npm run install:db [--force|--drop]"
                echo ""
                echo "Options:"
                echo "  --force, --drop  Drop existing monk database and recreate"
                echo "  --help, -h       Show this help message"
                echo ""
                echo "Environment variables:"
                echo "  PGHOST           PostgreSQL host (default: localhost)"
                echo "  PGPORT           PostgreSQL port (default: 5432)"
                echo "  PGUSER           PostgreSQL user (default: postgres)"
                exit 0
                ;;
        esac
    done

    log_info "Starting database installation..."
    log_info "Connection: ${PGUSER}@${PGHOST}:${PGPORT}"
    echo ""

    # Step 1: Check connection
    check_postgres_connection
    echo ""

    # Step 2: Drop database if force mode
    if [[ "$force_mode" = true ]]; then
        log_warn "Force mode enabled - will drop existing database"
        drop_database
        echo ""
    fi

    # Step 3: Create database
    create_database
    echo ""

    # Step 4: Deploy infrastructure
    deploy_infrastructure
    echo ""

    # Step 5: Verify installation
    verify_installation
    echo ""

    log_info "✓ Database installation completed successfully!"
    echo ""
    log_info "Next steps:"
    echo "  1. Start the server: npm start"
    echo "  2. Register a tenant: POST /auth/register"
    echo "  3. Deploy fixtures to tenant: POST /auth/templates"
}

main "$@"

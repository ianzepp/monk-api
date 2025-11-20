#!/usr/bin/env bash
# Fixtures Build Script
# Creates template databases from fixture definitions for fast tenant cloning

# Source helpers
SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/../spec/curl-helper.sh"
source "$SCRIPT_DIR/../spec/test-tenant-helper.sh"

# Parse arguments
FORCE_REBUILD=false
TEMPLATE_NAME="testing"

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_REBUILD=true
            shift
            ;;
        --help|-h)
            echo "Fixtures Build Script"
            echo "Usage: $0 [options] [template_name]"
            echo ""
            echo "Arguments:"
            echo "  template_name    Name of the fixture template to build (default: testing)"
            echo ""
            echo "Options:"
            echo "  --force         Delete existing template database if it exists"
            echo "  --help, -h      Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 testing"
            echo "  $0 --force system"
            echo "  npm run fixtures:build -- --force demo"
            exit 0
            ;;
        -*)
            print_error "Unknown option: $1"
            exit 1
            ;;
        *)
            TEMPLATE_NAME="$1"
            shift
            ;;
    esac
done

# Validate template name format (lowercase and underscores only)
if [[ ! "$TEMPLATE_NAME" =~ ^[a-z_]+$ ]]; then
    print_error "Template name must contain only lowercase letters and underscores"
    print_error "Invalid name: '$TEMPLATE_NAME'"
    exit 1
fi

# Configuration
FIXTURES_DIR="fixtures/${TEMPLATE_NAME}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() { echo -e "${BLUE}=== $1 ===${NC}"; }
print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

fail() {
    print_error "$1"
    exit 1
}

print_header "Building template: $TEMPLATE_NAME"

# Validate fixture directory exists
if [[ ! -d "$FIXTURES_DIR" ]]; then
    fail "Fixture directory not found: $FIXTURES_DIR"
fi

# Validate template.json exists
if [[ ! -f "$FIXTURES_DIR/template.json" ]]; then
    fail "template.json not found in $FIXTURES_DIR"
fi

# Validate load.sql exists (required)
if [[ ! -f "$FIXTURES_DIR/load.sql" ]]; then
    fail "load.sql not found in $FIXTURES_DIR (required for all fixtures)"
fi

# Read template metadata
if command -v jq >/dev/null 2>&1; then
    template_description=$(jq -r '.description // ""' "$FIXTURES_DIR/template.json" 2>/dev/null || echo "")
    template_parent=$(jq -r '.parent // "null"' "$FIXTURES_DIR/template.json" 2>/dev/null || echo "null")
    is_system=$(jq -r '.is_system // false' "$FIXTURES_DIR/template.json" 2>/dev/null || echo "false")
else
    print_warning "jq not found - using default values"
    template_description=""
    template_parent="null"
    is_system="false"
fi

print_info "Template: $TEMPLATE_NAME"
print_info "Parent: $template_parent"
print_info "Description: $template_description"
echo ""

# Determine parent template database
if [[ "$template_parent" == "null" || "$template_parent" == "" ]]; then
    parent_db=""
    print_info "Building from scratch (no parent template)"
else
    parent_db="monk_template_${template_parent}"
    print_info "Extends template: $template_parent ($parent_db)"

    # Verify parent template exists
    if ! psql -lqt | cut -d'|' -f1 | sed 's/^ *//;s/ *$//' | grep -qx "$parent_db" 2>/dev/null; then
        fail "Parent template database not found: $parent_db"
    fi
fi
echo ""

# Target template database name
template_db_final="monk_template_$TEMPLATE_NAME"

# Check if target template database already exists
if psql -lqt | cut -d'|' -f1 | sed 's/^ *//;s/ *$//' | grep -qx "$template_db_final" 2>/dev/null; then
    if [[ "$FORCE_REBUILD" == true ]]; then
        print_warning "Template database '$template_db_final' already exists - removing due to --force"

        if dropdb "$template_db_final" 2>/dev/null; then
            print_success "Template database dropped"
        else
            fail "Failed to drop template database (may have active connections)"
        fi

        # Remove template registry entry
        psql -d monk -c "DELETE FROM templates WHERE name = '$TEMPLATE_NAME'" >/dev/null 2>&1
        print_success "Template registry cleaned"
    else
        print_warning "Template database '$template_db_final' already exists"
        print_info "To rebuild, use --force or manually clean up:"
        print_info "  dropdb '$template_db_final'"
        print_info "  psql -d monk -c \"DELETE FROM templates WHERE name = '$TEMPLATE_NAME'\""
        fail "Template database already exists"
    fi
fi

# Create template database
print_step "Creating template database: $template_db_final"

if [[ -n "$parent_db" ]]; then
    # Clone from parent template
    if ! createdb "$template_db_final" -T "$parent_db" 2>/dev/null; then
        fail "Failed to clone from parent template: $parent_db"
    fi
    print_success "Cloned from parent: $parent_db"
else
    # Create empty database
    if ! createdb "$template_db_final" 2>/dev/null; then
        fail "Failed to create database: $template_db_final"
    fi
    print_success "Created empty database"
fi

# Load fixture via load.sql
print_step "Loading fixture: $FIXTURES_DIR/load.sql"

if psql -d "$template_db_final" -f "$FIXTURES_DIR/load.sql"; then
    print_success "Fixture loaded successfully"
else
    dropdb "$template_db_final" 2>/dev/null || true
    fail "Failed to load fixture"
fi

# Register template in templates table
print_step "Registering template in registry"

# Escape description for SQL
escaped_description=$(echo "$template_description" | sed "s/'/''/g")

register_sql="
    INSERT INTO templates (name, database, description, is_system)
    VALUES ('$TEMPLATE_NAME', '$template_db_final', '$escaped_description', $is_system)
    ON CONFLICT (name) DO UPDATE SET
        database = EXCLUDED.database,
        description = EXCLUDED.description,
        is_system = EXCLUDED.is_system
"

if psql -d monk -c "$register_sql" >/dev/null 2>&1; then
    print_success "Template registered: $TEMPLATE_NAME"
else
    dropdb "$template_db_final" 2>/dev/null || true
    fail "Failed to register template"
fi

# Verify template registration
print_step "Verifying template registration"
template_check=$(psql -d monk -t -c "SELECT COUNT(*) FROM templates WHERE name = '$TEMPLATE_NAME'" | xargs)

if [[ "$template_check" == "1" ]]; then
    print_success "Template successfully registered and ready for use"
else
    fail "Template registration verification failed"
fi

# Summary
print_header "Template Build Complete"
echo "Template Name: $TEMPLATE_NAME"
echo "Database Name: $template_db_final"
echo "Parent Template: ${template_parent:-none}"
echo "Description: $template_description"
echo ""
print_success "Template ready for cloning via PostgreSQL CREATE DATABASE WITH TEMPLATE"

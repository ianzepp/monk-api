#!/usr/bin/env bash
set -e

# Fixtures Lock Script
# Creates a lock file to prevent fixture regeneration

TEMPLATE_NAME="$1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

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

# Validate template name
if [[ -z "$TEMPLATE_NAME" ]]; then
    print_error "Usage: npm run fixtures:lock <template-name>"
    print_error "Example: npm run fixtures:lock basic_large"
    exit 1
fi

# Validate template name format (lowercase and underscores only)
if [[ ! "$TEMPLATE_NAME" =~ ^[a-z_]+$ ]]; then
    print_error "Template name must contain only lowercase letters and underscores"
    print_error "Invalid name: '$TEMPLATE_NAME'"
    print_error "Valid examples: basic_large, demo_small, test_data"
    print_error "Invalid examples: Basic-Large, demo-small, TestData"
    exit 1
fi

FIXTURES_DIR="fixtures/$TEMPLATE_NAME"
LOCK_FILE="$FIXTURES_DIR/.locked"

# Check if fixtures directory exists
if [[ ! -d "$FIXTURES_DIR" ]]; then
    print_error "Fixtures directory does not exist: $FIXTURES_DIR"
    exit 1
fi

# Check if already locked
if [[ -f "$LOCK_FILE" ]]; then
    print_warning "Template '$TEMPLATE_NAME' is already locked"
    print_step "Lock details:"
    cat "$LOCK_FILE"
    exit 0
fi

# Create lock file
print_step "Creating lock file for template: $TEMPLATE_NAME"

cat > "$LOCK_FILE" <<EOF
{
  "template": "$TEMPLATE_NAME",
  "locked_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "locked_by": "$(whoami)@$(hostname)",
  "reason": "Template locked to prevent accidental regeneration",
  "schemas": $(find "$FIXTURES_DIR/describe" -name "*.json" 2>/dev/null | wc -l | xargs),
  "data_files": $(find "$FIXTURES_DIR/data" -name "*.json" 2>/dev/null | wc -l | xargs)
}
EOF

print_success "Template '$TEMPLATE_NAME' has been locked"
print_step "Lock file created: $LOCK_FILE"
print_step "To unlock: rm $LOCK_FILE"
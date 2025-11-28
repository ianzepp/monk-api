#!/bin/bash

#
# Compilation Script for Monk API
#
# Compiles TypeScript source code and copies non-TS assets to dist/
# This ensures all runtime dependencies are available in the compiled output.
#

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly NC='\033[0m' # No Color

# Script directory and project root
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Compilation failed with exit code $exit_code"
    fi
    exit $exit_code
}

trap cleanup EXIT

main() {
    cd "$PROJECT_ROOT"

    log_info "Starting compilation process..."

    # Clean existing dist directory
    if [[ -d "dist" ]]; then
        log_info "Cleaning existing dist/ directory"
        rm -rf dist/
    fi

    # Step 1: TypeScript compilation
    log_info "Compiling TypeScript sources..."
    if ! npx tsc; then
        log_error "TypeScript compilation failed"
        exit 1
    fi

    # Step 2: Resolve path aliases
    log_info "Resolving TypeScript path aliases..."
    if ! npx tsc-alias; then
        log_error "Path alias resolution failed"
        exit 1
    fi

    # Step 2b: Generate version.ts from package.json before compilation
    # This avoids JSON import issues with Bun
    local pkg_version=$(node -p "require('./package.json').version")
    log_info "Injecting version $pkg_version into dist/lib/version.js..."
    sed -i.bak "s|'0.0.0'|'$pkg_version'|g" dist/lib/version.js
    rm -f dist/lib/version.js.bak

    # Step 3: Copy non-TypeScript assets
    # Note: src/describedata was removed - test fixture models are in spec/fixtures/model/
    log_info "Checking for additional assets to copy..."

    # Copy markdown documentation files
    if [[ -n "$(find src -name '*.md' 2>/dev/null)" ]]; then
        log_info "Copying documentation files..."
        # Preserve directory structure for documentation
        find src -name '*.md' -type f | while read -r file; do
            # Get relative path from src/
            rel_path="${file#src/}"
            dest_dir="dist/$(dirname "$rel_path")"
            mkdir -p "$dest_dir"
            cp "$file" "$dest_dir/"
        done
        log_info "Copied $(find src -name '*.md' | wc -l | tr -d ' ') documentation files"
    else
        log_info "No documentation files to copy"
    fi

    # Step 4: Copy SQL files if they exist (in src/lib/sql/)
    if [[ -d "src/lib/sql" ]]; then
        log_info "Copying SQL files..."
        mkdir -p "dist/lib/sql"
        cp -r src/lib/sql/* dist/lib/sql/
        log_info "Copied $(find src/lib/sql -name '*.sql' | wc -l | tr -d ' ') SQL files"
    fi

    # Step 4b: Copy TTY man pages if they exist
    if [[ -d "src/lib/tty/man" ]]; then
        log_info "Copying TTY man pages..."
        mkdir -p "dist/lib/tty/man"
        cp -r src/lib/tty/man/* dist/lib/tty/man/
        log_info "Copied $(ls src/lib/tty/man | wc -l | tr -d ' ') man pages"
    fi

    # Step 5: Copy compiled fixtures (deploy.sql and template.json)
    if [[ -d "fixtures" ]]; then
        log_info "Copying compiled fixtures..."
        mkdir -p "dist/fixtures"

        # Copy each fixture directory (preserving structure)
        for fixture_dir in fixtures/*/; do
            if [[ -d "$fixture_dir" ]]; then
                fixture_name=$(basename "$fixture_dir")
                mkdir -p "dist/fixtures/$fixture_name"

                # Copy deploy.sql (compiled fixture)
                if [[ -f "$fixture_dir/deploy.sql" ]]; then
                    cp "$fixture_dir/deploy.sql" "dist/fixtures/$fixture_name/"
                fi

                # Copy template.json (metadata needed for dependency resolution)
                if [[ -f "$fixture_dir/template.json" ]]; then
                    cp "$fixture_dir/template.json" "dist/fixtures/$fixture_name/"
                fi
            fi
        done

        log_info "Copied $(find fixtures -name 'deploy.sql' | wc -l | tr -d ' ') compiled fixtures"
    fi

    # Step 6: Validation
    log_info "Validating compilation output..."

    if [[ ! -f "dist/index.js" ]]; then
        log_error "Main entry point dist/index.js not found"
        exit 1
    fi

    local ts_files=$(find src -name '*.ts' | wc -l | tr -d ' ')
    local js_files=$(find dist -name '*.js' | wc -l | tr -d ' ')

    log_info "Compilation summary:"
    log_info "  TypeScript files: $ts_files"
    log_info "  JavaScript files: $js_files"
    log_info "  Metadata files: $(find dist/describedata -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
    log_info "  Documentation files: $(find dist -name 'PUBLIC.md' 2>/dev/null | wc -l | tr -d ' ')"
    log_info "  SQL files: $(find dist/lib/sql -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')"
    log_info "  Fixture files: $(find dist/fixtures -name 'deploy.sql' 2>/dev/null | wc -l | tr -d ' ')"

    log_info "Compilation completed successfully!"

    # Step 7: Extract TODO/FIXME/HACK tags
    log_info "Extracting TODO tags from codebase..."
    if [[ -f "$SCRIPT_DIR/build-todos.sh" ]]; then
        "$SCRIPT_DIR/build-todos.sh" || log_warn "TODO extraction failed (non-critical)"
    else
        log_warn "TODO extraction script not found (skipping)"
    fi

    # Step 8: Extract @deprecated tags
    log_info "Extracting @deprecated tags from codebase..."
    if [[ -f "$SCRIPT_DIR/build-deprecated.sh" ]]; then
        "$SCRIPT_DIR/build-deprecated.sh" || log_warn "Deprecated extraction failed (non-critical)"
    else
        log_warn "Deprecated extraction script not found (skipping)"
    fi
}

main "$@"

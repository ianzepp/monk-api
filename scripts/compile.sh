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
    
    # Step 3: Copy non-TypeScript assets
    log_info "Copying metadata files..."
    if [[ -d "src/metadata" ]]; then
        mkdir -p "dist/metadata"
        cp -r src/metadata/* dist/metadata/
        log_info "Copied $(find src/metadata -name '*.yaml' | wc -l | tr -d ' ') YAML files"
    else
        log_warn "No src/metadata directory found - skipping metadata copy"
    fi
    
    # Step 4: Copy SQL files if they exist
    if [[ -d "sql" ]]; then
        log_info "Copying SQL files..."
        mkdir -p "dist/sql"
        cp -r sql/* dist/sql/
        log_info "Copied $(find sql -name '*.sql' | wc -l | tr -d ' ') SQL files"
    fi
    
    # Step 5: Validation
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
    log_info "  Metadata files: $(find dist/metadata -name '*.yaml' 2>/dev/null | wc -l | tr -d ' ')"
    log_info "  SQL files: $(find dist/sql -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')"
    
    log_info "Compilation completed successfully!"
}

main "$@"
#!/bin/bash
set -e

# Compile TypeScript for spec files using tsconfig.spec.json
# This ensures all test files compile properly since main tsconfig.json excludes tests

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

print_info "Starting spec TypeScript compilation..."
print_info "Using tsconfig.spec.json (includes src/ + spec/ directories)"

# Check if tsconfig.spec.json exists
if [ ! -f "tsconfig.spec.json" ]; then
    print_error "tsconfig.spec.json not found"
    exit 1
fi

# Run TypeScript compiler with spec configuration
print_info "Running TypeScript compiler for spec files..."
if npx tsc --project tsconfig.spec.json --noEmit; then
    print_success "Spec TypeScript compilation successful!"
    print_info "All source and test files compile without errors"
else
    print_error "Spec TypeScript compilation failed"
    print_error "Fix TypeScript errors in spec/ files before proceeding"
    exit 1
fi

print_info "Spec compilation completed successfully"
#!/bin/bash
# Build script for @monk-app/openapi package

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PACKAGE_DIR"

# Compile TypeScript
echo "Compiling TypeScript..."
tsc

echo "Build complete"

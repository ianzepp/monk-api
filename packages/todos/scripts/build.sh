#!/bin/bash
# Build script for @monk-app/todos package

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PACKAGE_DIR"

# Compile TypeScript
echo "Compiling TypeScript..."
tsc

# Copy docs directory if it exists
if [ -d "src/docs" ]; then
    echo "Copying documentation..."
    cp -r src/docs dist/
else
    echo "No src/docs directory found, skipping documentation copy"
fi

echo "Build complete"

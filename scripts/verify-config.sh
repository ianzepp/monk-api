#!/bin/bash
# Verify critical configuration files exist
# This script should be run during build/test to ensure monk-cli integration works

set -e

CONFIG_DIR=".config/monk"
REQUIRED_FILES=(
    "$CONFIG_DIR/.gitkeep"
    "$CONFIG_DIR/README.md"
)

echo "🔍 Verifying monk configuration files..."

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
        echo "❌ MISSING: $file"
    else
        echo "✅ Found: $file"
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo ""
    echo "🚨 CRITICAL ERROR: Missing monk configuration files!"
    echo "   These files are required for monk-cli test environment functionality."
    echo ""
    echo "   Missing files:"
    for file in "${MISSING_FILES[@]}"; do
        echo "   - $file"
    done
    echo ""
    echo "   To fix this issue:"
    echo "   1. Restore the files from git history: git show 6e07028:$CONFIG_DIR/"
    echo "   2. Or restore from backup if available"
    echo "   3. Ensure .config/monk/ directory structure is preserved"
    echo ""
    echo "   The test environment will not work without these files!"
    exit 1
fi

echo "✅ All monk configuration files verified successfully"
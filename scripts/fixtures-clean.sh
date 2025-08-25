#!/bin/bash
# Clean template databases

set -e

# Get pattern argument if provided
PATTERN="${1:-}"

# Ensure TypeScript is compiled
npm run compile > /dev/null 2>&1 || {
    echo "❌ TypeScript compilation failed"
    exit 1
}

# Clean templates using dedicated TypeScript file
npx tsx src/scripts/fixtures-clean.ts "$PATTERN"
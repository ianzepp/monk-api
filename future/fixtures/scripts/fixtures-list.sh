#!/bin/bash
# List available template databases

set -e

# Ensure TypeScript is compiled
npm run compile > /dev/null 2>&1 || {
    echo "❌ TypeScript compilation failed"
    exit 1
}

# List templates using dedicated TypeScript file
npx tsx src/scripts/fixtures-list.ts
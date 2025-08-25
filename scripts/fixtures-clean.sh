#!/bin/bash
# Clean template databases

set -e

# Get pattern argument if provided
PATTERN="${1:-}"

if [ -n "$PATTERN" ]; then
    echo "🧹 Cleaning template databases matching pattern: $PATTERN"
else
    echo "🧹 Cleaning all template databases..."
fi

# Ensure TypeScript is compiled
npm run compile > /dev/null 2>&1 || {
    echo "❌ TypeScript compilation failed"
    exit 1
}

# Clean templates
if [ -n "$PATTERN" ]; then
    node -e "
    import { TemplateDatabase } from './dist/lib/fixtures/template-database.js';
    await TemplateDatabase.cleanTemplates('$PATTERN');
    "
else
    node -e "
    import { TemplateDatabase } from './dist/lib/fixtures/template-database.js';
    await TemplateDatabase.cleanTemplates();
    "
fi

echo "✅ Template cleanup completed"
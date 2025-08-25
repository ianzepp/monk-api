#!/bin/bash
# List available template databases

set -e

echo "📋 Available template databases:"

# Ensure TypeScript is compiled
npm run compile > /dev/null 2>&1 || {
    echo "❌ TypeScript compilation failed"
    exit 1
}

# List templates
node -e "
import { TemplateDatabase } from './dist/lib/fixtures/template-database.js';
const templates = await TemplateDatabase.listTemplates();
if (templates.length === 0) {
    console.log('  (No templates found - run \`npm run fixtures:build\` to create them)');
} else {
    templates.forEach(template => console.log(\`  • \${template}\`));
}
"
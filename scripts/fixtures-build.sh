#!/bin/bash
# Build template databases for testing

set -e

echo "🔨 Building template databases..."

# Ensure TypeScript is compiled
echo "📦 Compiling TypeScript..."
npm run compile

# Build basic template
echo "🏗️  Building basic template..."
node -e "
import { TemplateDatabase } from './dist/lib/fixtures/template-database.js';
await TemplateDatabase.buildBasicTemplate();
"

echo "✅ Template databases built successfully"
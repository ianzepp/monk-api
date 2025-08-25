#!/bin/bash
# Build template databases for testing

set -e

echo "🔨 Building template databases..."

# Ensure TypeScript is compiled
echo "📦 Compiling TypeScript..."
npm run compile

# Build templates using dedicated TypeScript file
npx tsx src/scripts/fixtures-build.ts

echo "✅ Template databases built successfully"
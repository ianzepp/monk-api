#!/bin/bash
# Infrastructure Test - Hono Command Scripts

echo "=== Hono Command Scripts Test ==="

# Test basic hono:status command
echo "Testing npm run hono:status..."
npm run hono:status

echo ""
echo "✅ Basic hono commands test completed"
#!/bin/bash
# Test Bun server startup

set -e

echo "=== Testing Bun Server ==="

# Kill any existing processes on port 9001
echo "Clearing port 9001..."
lsof -ti:9001 | xargs kill 2>/dev/null || true
sleep 1

# Start server in background
echo "Starting Bun server..."
bun dist/index.js > /tmp/bun-server.log 2>&1 &
BUN_PID=$!

# Wait for startup
sleep 3

# Test health endpoint
echo "Testing /health endpoint..."
RESPONSE=$(curl -s http://localhost:9001/health)
echo "$RESPONSE" | head -c 200
echo ""

# Check log for Bun detection
echo ""
echo "=== Server Log ==="
grep -E "(HTTP API server running|error)" /tmp/bun-server.log || true

# Cleanup
echo ""
echo "Stopping server (PID: $BUN_PID)..."
kill $BUN_PID 2>/dev/null || true

echo "Done."

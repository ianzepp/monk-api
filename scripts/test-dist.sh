#!/bin/bash
# Test the standalone distribution

set -e

echo "=== Testing Standalone Distribution ==="
echo ""

# Check if binary exists
if [ ! -f "dist-standalone/monk-api" ]; then
    echo "ERROR: dist-standalone/monk-api not found"
    echo "Run: ./scripts/build-standalone.sh first"
    exit 1
fi

# Clean up
rm -rf dist-standalone/.data 2>/dev/null || true
lsof -ti:9001 | xargs kill 2>/dev/null || true
sleep 1

# Run from dist-standalone directory
cd dist-standalone

echo "Starting standalone binary..."
./monk-api > /tmp/dist-test.log 2>&1 &
SERVER_PID=$!

# Wait for startup
sleep 4

# Show log
echo ""
echo "=== Startup Log ==="
head -20 /tmp/dist-test.log
echo ""

# Test health
echo "=== Testing /health ==="
curl -s http://localhost:9001/health | head -c 200
echo ""
echo ""

# Test login
echo "=== Testing /auth/login ==="
LOGIN=$(curl -s -X POST http://localhost:9001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"tenant":"root","username":"root"}')
echo "$LOGIN" | head -c 300
echo ""

# Extract token
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo ""
    echo "=== Login Successful! Token received ==="

    # Test authenticated endpoint
    echo ""
    echo "=== Testing /api/describe (authenticated) ==="
    curl -s http://localhost:9001/api/describe \
        -H "Authorization: Bearer $TOKEN" | head -c 200
    echo ""
fi

# Cleanup
echo ""
echo "=== Stopping server ==="
kill $SERVER_PID 2>/dev/null || true

# Show database created
echo ""
echo "=== SQLite database ==="
ls -la .data/db_main/ 2>/dev/null || echo "No database directory"

echo ""
echo "Done."

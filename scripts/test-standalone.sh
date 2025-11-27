#!/bin/bash
# Test standalone SQLite mode

set -e

echo "=== Testing Standalone Mode (sqlite:root) ==="

# Clean up any existing test data
rm -rf .data/db_main/root.db 2>/dev/null || true

# Kill any existing processes on port 9001
echo "Clearing port 9001..."
lsof -ti:9001 | xargs kill 2>/dev/null || true
sleep 1

# Start server in standalone mode
echo "Starting server with DATABASE_URL=sqlite:root..."
DATABASE_URL=sqlite:root bun dist/index.js > /tmp/standalone-server.log 2>&1 &
SERVER_PID=$!

# Wait for startup
sleep 4

# Show startup logs
echo ""
echo "=== Startup Log ==="
grep -E "(Standalone|DATABASE_URL|initialized|Login)" /tmp/standalone-server.log || true
echo ""

# Test health endpoint
echo "=== Testing /health ==="
curl -s http://localhost:9001/health | head -c 200
echo ""
echo ""

# Test login
echo "=== Testing /auth/login ==="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:9001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"tenant": "root", "username": "root"}')
echo "$LOGIN_RESPONSE" | head -c 500
echo ""

# Extract token if successful
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
    echo ""
    echo "=== Login Successful! ==="
    echo "Token: ${TOKEN:0:50}..."

    # Test authenticated request
    echo ""
    echo "=== Testing /api/describe (with token) ==="
    curl -s http://localhost:9001/api/describe \
        -H "Authorization: Bearer $TOKEN" | head -c 300
    echo ""
else
    echo ""
    echo "=== Login Failed ==="
    cat /tmp/standalone-server.log | tail -20
fi

# Cleanup
echo ""
echo "=== Stopping server (PID: $SERVER_PID) ==="
kill $SERVER_PID 2>/dev/null || true

echo ""
echo "=== SQLite database created ==="
ls -la .data/db_main/ 2>/dev/null || echo "No database files found"

echo ""
echo "Done."

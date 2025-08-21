#!/bin/bash
set -e

# Hono Restart - Stop and restart the Hono server

# Get port argument
PORT="$1"

echo "=== Restarting Hono Server ==="

# Stop existing server
echo "Stopping current server..."
./scripts/hono-stop.sh

# Start server with port if provided
echo "Starting server..."
if [ -n "$PORT" ]; then
    ./scripts/hono-start.sh "$PORT"
else
    ./scripts/hono-start.sh
fi

echo "✅ Server restarted successfully"
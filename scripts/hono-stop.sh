#!/bin/bash
set -e

# Hono Stop - Gracefully stop the Hono development server

# Configuration
PID_FILE=".monk-hono.pid"
PORT_FILE=".monk-hono.port"

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    echo "No server PID file found"
    echo "Server may not be running or was started manually"
    exit 0
fi

# Read PID
SERVER_PID=$(cat "$PID_FILE")

# Check if process is still running
if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
    echo "Server (PID $SERVER_PID) is not running"
    rm -f "$PID_FILE" "$PORT_FILE"
    exit 0
fi

echo "Stopping Hono server (PID $SERVER_PID)..."

# Try graceful shutdown first
kill -TERM "$SERVER_PID" 2>/dev/null || true

# Wait for graceful shutdown
for i in {1..10}; do
    if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
        echo "✅ Server stopped gracefully"
        rm -f "$PID_FILE" "$PORT_FILE"
        exit 0
    fi
    sleep 1
done

# Force kill if graceful shutdown failed
echo "Graceful shutdown failed, force killing..."
kill -KILL "$SERVER_PID" 2>/dev/null || true

# Final verification
sleep 1
if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
    echo "✅ Server force killed"
    rm -f "$PID_FILE" "$PORT_FILE"
else
    echo "❌ Failed to stop server"
    exit 1
fi
#!/bin/bash
set -e

# Hono Start - Start the Hono development server

# Configuration
DEFAULT_PORT=9001
PID_FILE=".monk-hono.pid"
PORT_FILE=".monk-hono.port"

# Get port from argument or use default
PORT="${1:-$DEFAULT_PORT}"

# Check if server is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "Server already running on PID $OLD_PID"
        if [ -f "$PORT_FILE" ]; then
            CURRENT_PORT=$(cat "$PORT_FILE")
            echo "Server accessible at: http://localhost:$CURRENT_PORT"
        fi
        exit 0
    else
        echo "Cleaning up stale PID file"
        rm -f "$PID_FILE" "$PORT_FILE"
    fi
fi

# Check if port is in use
if lsof -i ":$PORT" > /dev/null 2>&1; then
    echo "Port $PORT is already in use"
    echo "Use 'npm run hono:list' to see running processes"
    exit 1
fi

echo "Starting Hono server on port $PORT..."

# Start server in background
npm run dev &
SERVER_PID=$!

# Store PID and port
echo "$SERVER_PID" > "$PID_FILE"
echo "$PORT" > "$PORT_FILE"

# Wait a moment for server to start
sleep 2

# Verify server started
if ps -p "$SERVER_PID" > /dev/null 2>&1; then
    echo "✅ Hono server started successfully"
    echo "   PID: $SERVER_PID"
    echo "   Port: $PORT"
    echo "   URL: http://localhost:$PORT"
    echo ""
    echo "Use 'npm run hono:stop' to stop the server"
    echo "Use 'npm run hono:status' to check status"
else
    echo "❌ Failed to start server"
    rm -f "$PID_FILE" "$PORT_FILE"
    exit 1
fi
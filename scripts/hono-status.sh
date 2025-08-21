#!/bin/bash
set -e

# Hono Status - Check server status and connection

# Configuration  
PID_FILE=".monk-hono.pid"
PORT_FILE=".monk-hono.port"

echo "=== Hono Server Status ==="

# Check PID file
if [ -f "$PID_FILE" ]; then
    SERVER_PID=$(cat "$PID_FILE")
    
    # Check if process is running
    if ps -p "$SERVER_PID" > /dev/null 2>&1; then
        echo "✅ Server running (PID: $SERVER_PID)"
        
        # Get port if available
        if [ -f "$PORT_FILE" ]; then
            PORT=$(cat "$PORT_FILE")
            echo "   Port: $PORT"
            echo "   URL: http://localhost:$PORT"
            
            # Try to ping the server
            if curl -s "http://localhost:$PORT/ping" > /dev/null 2>&1; then
                echo "   Status: Responding to requests"
            else
                echo "   Status: Not responding to requests"
            fi
        else
            echo "   Port: Unknown (no port file)"
        fi
        
        # Show process info
        echo "   Process info:"
        ps -p "$SERVER_PID" -o pid,ppid,pcpu,pmem,command | tail -n +2 | sed 's/^/     /'
    else
        echo "❌ Server not running (stale PID file)"
        rm -f "$PID_FILE" "$PORT_FILE"
    fi
else
    echo "❌ Server not running (no PID file)"
fi

echo ""
echo "Available commands:"
echo "  npm run hono:start [port] - Start server"
echo "  npm run hono:stop         - Stop server"
echo "  npm run hono:restart      - Restart server"  
echo "  npm run hono:list         - List all processes"
#!/bin/bash
set -e

# Hono Kill All - Emergency cleanup of all Hono processes

echo "=== Emergency Hono Process Cleanup ==="

# Find all Node.js processes that might be Hono-related
HONO_PIDS=$(ps aux | grep -E "(tsx.*src/index|node.*dist/index|hono)" | grep -v grep | awk '{print $2}')

if [ -z "$HONO_PIDS" ]; then
    echo "No Hono processes found to kill"
else
    echo "Found Hono processes to terminate:"
    ps aux | grep -E "(tsx.*src/index|node.*dist/index|hono)" | grep -v grep | awk '{print "  PID " $2 ": " $11 " " $12 " " $13}'
    
    echo ""
    echo "Terminating processes..."
    
    # Try graceful termination first
    for PID in $HONO_PIDS; do
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "  Stopping PID $PID (graceful)..."
            kill -TERM "$PID" 2>/dev/null || true
        fi
    done
    
    # Wait for graceful shutdown
    sleep 3
    
    # Force kill any remaining processes
    for PID in $HONO_PIDS; do
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "  Force killing PID $PID..."
            kill -KILL "$PID" 2>/dev/null || true
        fi
    done
    
    sleep 1
    
    # Verify cleanup
    REMAINING=$(ps aux | grep -E "(tsx.*src/index|node.*dist/index|hono)" | grep -v grep | wc -l)
    if [ "$REMAINING" -eq 0 ]; then
        echo "✅ All Hono processes terminated"
    else
        echo "⚠️  Some processes may still be running"
        ps aux | grep -E "(tsx.*src/index|node.*dist/index|hono)" | grep -v grep
    fi
fi

# Clean up PID files
rm -f ".monk-hono.pid" ".monk-hono.port"

echo ""
echo "Use 'npm run hono:status' to verify cleanup"
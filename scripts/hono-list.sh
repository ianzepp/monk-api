#!/bin/bash
set -e

# Hono List - List all running Hono-related processes

echo "=== Running Hono Processes ==="

# Find all Node.js processes that might be Hono-related
HONO_PROCESSES=$(ps aux | grep -E "(tsx.*src/index|node.*dist/index|hono)" | grep -v grep)

if [ -z "$HONO_PROCESSES" ]; then
    echo "No Hono processes found"
else
    echo "PID     CPU%  MEM%  COMMAND"
    echo "------- ----- ----- -------"
    echo "$HONO_PROCESSES" | while read line; do
        PID=$(echo "$line" | awk '{print $2}')
        CPU=$(echo "$line" | awk '{print $3}')
        MEM=$(echo "$line" | awk '{print $4}')
        CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
        printf "%-7s %-5s %-5s %s\n" "$PID" "$CPU%" "$MEM%" "$CMD"
    done
fi

echo ""

# Check for port usage
echo "=== Port Usage ==="
PORTS=$(lsof -i :9001,3000,3001,4000 2>/dev/null | tail -n +2 || echo "")
if [ -n "$PORTS" ]; then
    echo "COMMAND   PID     PORT"
    echo "-------   ------- ----"
    echo "$PORTS" | awk '{print $1 "   " $2 "   " $9}' | sed 's/.*://'
else
    echo "No servers detected on common Hono ports (3000, 3001, 4000, 9001)"
fi

echo ""
echo "Use 'npm run hono:killall' to stop all Hono processes"
#!/bin/bash
set -e

# ===================================================================
# Monk API Server Startup Script
# ===================================================================
#
# Starts the Monk HTTP API server using TypeScript execution.
# This script provides a consistent way to start the API server
# with proper error handling and configuration display.
#
# Usage:
#   ./scripts/api-start.sh
#   npm run api:start
#
# Environment Variables:
#   PORT=9001                # HTTP API server port (default: 9001)
#   JWT_SECRET=secret        # JWT secret for token validation
#   DB_HOST=localhost        # Database host
#   DB_PORT=5432             # Database port
#   DB_USER=postgres         # Database user
#
# ===================================================================

echo "🚀 Starting Monk HTTP API Server..."
echo "====================================="

# Display configuration
API_PORT=${PORT:-9001}
echo "📡 Configuration:"
echo "   Port: $API_PORT"
echo "   Environment: ${NODE_ENV:-development}"

if [ -n "$JWT_SECRET" ]; then
    echo "   JWT Secret: configured"
else
    echo "   JWT Secret: using default (change for production)"
fi

if [ -n "$DB_HOST" ]; then
    echo "   Database: $DB_HOST:${DB_PORT:-5432}"
else
    echo "   Database: localhost:5432 (default)"
fi

echo ""

# Start the HTTP API server
echo "🔧 Starting TypeScript execution..."
exec tsx src/index.ts
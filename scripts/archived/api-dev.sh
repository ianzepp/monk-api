#!/bin/bash
set -e

# ===================================================================
# Monk API Server Development Mode Script
# ===================================================================
#
# Starts the Monk HTTP API server in development mode with file watching.
# This script provides hot-reload functionality for development workflow.
#
# Usage:
#   ./scripts/api-dev.sh
#   npm run api:dev
#
# Features:
#   - File watching with automatic restarts
#   - TypeScript compilation on-the-fly
#   - Development-friendly error reporting
#
# Environment Variables:
#   PORT=9001                # HTTP API server port (default: 9001)
#   JWT_SECRET=secret        # JWT secret for token validation
#   DB_HOST=localhost        # Database host
#   DB_PORT=5432             # Database port
#   DB_USER=postgres         # Database user
#
# ===================================================================

echo "🔧 Starting Monk HTTP API Server (Development Mode)..."
echo "====================================================="

# Display configuration
API_PORT=${PORT:-9001}
echo "📡 Configuration:"
echo "   Port: $API_PORT"
echo "   Environment: development"
echo "   File Watching: enabled"

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
echo "🔥 Hot-reload enabled - files will be watched for changes"
echo "   Press Ctrl+C to stop the server"
echo ""

# Start the HTTP API server in watch mode
echo "🔧 Starting TypeScript execution with file watching..."
exec tsx watch src/index.ts
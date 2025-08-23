#!/bin/bash
set -e

# ===================================================================
# Monk FTP Server Startup Script
# ===================================================================
#
# Starts the Monk FTP server using TypeScript execution.
# This script provides a consistent way to start the FTP server
# with proper error handling and configuration display.
#
# Usage:
#   ./scripts/ftp-start.sh
#   npm run ftp:start
#
# Environment Variables:
#   FTP_PORT=2121            # FTP server port (default: 2121)
#   FTP_HOST=localhost       # FTP server host (default: localhost)
#   JWT_SECRET=secret        # JWT secret for token validation
#   DB_HOST=localhost        # Database host
#   DB_PORT=5432             # Database port
#   DB_USER=postgres         # Database user
#
# Authentication:
#   Username: api-user (or tenant-specific)
#   Password: <JWT-token-from-monk-auth>
#
# Example Usage:
#   # Get JWT token
#   monk auth login <tenant> <user>
#   
#   # Connect with FTP client
#   lftp -u "api-user,<JWT_TOKEN>" localhost:2121
#
# ===================================================================

echo "🚀 Starting Monk FTP Server..."
echo "==============================="

# Display configuration
FTP_PORT=${FTP_PORT:-2121}
FTP_HOST=${FTP_HOST:-localhost}

echo "📡 Configuration:"
echo "   Host: $FTP_HOST"
echo "   Port: $FTP_PORT"
echo "   Authentication: JWT tokens"
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
echo "💡 Connection Instructions:"
echo "   FTP URL: ftp://$FTP_HOST:$FTP_PORT"
echo "   Username: api-user"
echo "   Password: <your-jwt-token>"
echo ""
echo "🔧 To get JWT token:"
echo "   1. monk auth login <tenant> <user>"
echo "   2. Use the JWT token as FTP password"
echo ""

# Start the FTP server
echo "🔧 Starting FTP server..."
exec tsx src/ftp-server-cli.ts
#!/bin/bash
set -e

# Find CLI Module - Advanced search with filter DSL
# Reads search criteria from STDIN and sends to /api/find/:schema endpoint
# Usage: echo '{"where":{"status":"active"}}' | monk find account

# Import common functions
source "$(dirname "$0")/common.sh"

# Get the schema name
SCHEMA="$1"

if [[ -z "$SCHEMA" ]]; then
    echo '{"error":"Schema name required for find operation","success":false}' >&2
    exit 1
fi

# Check if we have input data
if [ -t 0 ]; then
    echo '{"error":"find expects JSON search criteria via STDIN","success":false}' >&2
    exit 1
fi

# Read JSON data from STDIN
INPUT_DATA=$(cat)

# Validate JSON format
if ! echo "$INPUT_DATA" | jshon >/dev/null 2>&1; then
    echo '{"error":"Invalid JSON format in search criteria","success":false}' >&2
    exit 1
fi

# Build the API endpoint URL
URL="${CLI_BASE_URL}/api/find/${SCHEMA}"

# Make HTTP request with JSON data
response=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -d "$INPUT_DATA")

# Process response using common handler
handle_response "$response"